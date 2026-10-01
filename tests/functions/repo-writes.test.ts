import { describe, expect, it } from 'vitest';
import {
  applyPatch, buildManageView, deleteExpired, findGroupByManageToken, findParticipantByToken, loadPairings, loadSent,
  markViewed, recordSends, reminderGroups, replaceDraw,
} from '../../functions/_shared/repo';
import { makeEnv } from '../helpers/env';
import { NOW, seedGroup } from '../helpers/fixtures';

const reload = async (env: ReturnType<typeof makeEnv>, token: string) => (await findGroupByManageToken(env.DB, token, NOW))!;

describe('applyPatch', () => {
  it('updates settings and moves the expiry with the event date', async () => {
    const env = makeEnv();
    const { manageToken, group } = await seedGroup(env);
    expect(await applyPatch(env.DB, group, { settings: { message: 'New', eventDate: '2027-01-25', remindersEnabled: true } })).toEqual({ ok: true });
    const updated = await reload(env, manageToken);
    expect(updated.message).toBe('New');
    expect(updated.reminders_enabled).toBe(1);
    expect(updated.expires_at).toBe('2028-02-01T00:00:00.000Z');
  });

  it('refuses reminders once the date is cleared', async () => {
    const env = makeEnv();
    const { group } = await seedGroup(env, { remindersEnabled: true });
    expect(await applyPatch(env.DB, group, { settings: { eventDate: null } })).toEqual({ ok: false, field: 'settings.remindersEnabled' });
  });

  it('renames, re-hints and sets emails', async () => {
    const env = makeEnv();
    const { manageToken, group } = await seedGroup(env);
    const [ann, , cat] = (await buildManageView(env.DB, group, env.LINK_KEY, true)).participants;
    await applyPatch(env.DB, group, { participants: [{ id: ann.id, name: 'Annie', hint: 'coffee' }, { id: cat.id, email: 'cat@example.com' }] });
    const view = await buildManageView(env.DB, await reload(env, manageToken), env.LINK_KEY, true);
    expect(view.participants.map(p => [p.name, p.hint, p.email])).toEqual([
      ['Annie', 'coffee', 'ann@example.com'], ['Bob', '', 'bob@example.com'], ['Cat', '', 'cat@example.com'],
    ]);
  });

  it('rejects a patch that duplicates a name, case-insensitively, and changes nothing', async () => {
    const env = makeEnv();
    const { manageToken, group } = await seedGroup(env);
    const [ann] = (await buildManageView(env.DB, group, env.LINK_KEY, true)).participants;
    expect(await applyPatch(env.DB, group, { participants: [{ id: ann.id, name: 'bob' }] })).toEqual({ ok: false, field: 'participants[0].name' });
    expect((await buildManageView(env.DB, await reload(env, manageToken), env.LINK_KEY, true)).participants[0].name).toBe('Ann');
  });

  it('rejects someone from another group', async () => {
    const env = makeEnv();
    const { group } = await seedGroup(env);
    expect(await applyPatch(env.DB, group, { participants: [{ id: 'not-here', name: 'X' }] })).toEqual({ ok: false, field: 'participants[0].id' });
  });
});

describe('replaceDraw', () => {
  it('keeps links for people who stay, adds new people, removes others and resets views', async () => {
    const env = makeEnv();
    const { manageToken, group, tokens } = await seedGroup(env);
    const view = await buildManageView(env.DB, group, env.LINK_KEY, true);
    const [ann, bob] = view.participants;
    await markViewed(env.DB, ann.id, NOW);

    const people = [
      { id: ann.id, name: 'Ann', hint: 'tea', email: 'ann@example.com', rules: [] },
      { id: bob.id, name: 'Bob', hint: '', email: 'bob@example.com', rules: [] },
      { id: 'new-dee', name: 'Dee', hint: '', email: null, rules: [{ type: 'mustNot' as const, targetParticipantId: ann.id }] },
    ];
    await replaceDraw(env.DB, group, people, new Map([[ann.id, bob.id], [bob.id, 'new-dee'], ['new-dee', ann.id]]), env.LINK_KEY, true);

    const updated = await reload(env, manageToken);
    expect(updated.draw_version).toBe(2);
    const after = await buildManageView(env.DB, updated, env.LINK_KEY, true);
    expect(after.participants.map(p => p.name)).toEqual(['Ann', 'Bob', 'Dee']);
    expect(after.participants[0].link).toBe(ann.link);
    expect(after.participants[0].opened).toBe(false);
    expect(after.participants[2].rules).toEqual([{ type: 'mustNot', targetParticipantId: ann.id }]);
    expect(await findParticipantByToken(env.DB, tokens.Cat, NOW)).toBeNull();
    const dee = after.participants[2];
    expect((await loadPairings(env.DB, group.id)).get(bob.id)).toBe(dee.id);
  });
});

describe('send log', () => {
  it('scopes all successful sends to the current draw', async () => {
    const env = makeEnv();
    const { manageToken, group } = await seedGroup(env);
    const [ann] = (await buildManageView(env.DB, group, env.LINK_KEY, true)).participants;
    await recordSends(env.DB, group, [{ participantId: ann.id, kind: 'link' }, { participantId: ann.id, kind: 'reminder_7d' }], NOW);
    expect((await loadSent(env.DB, group)).get(ann.id)).toEqual({ link: NOW.toISOString(), reminder_7d: NOW.toISOString() });

    await env.DB.prepare('UPDATE groups SET draw_version = 2 WHERE id = ?').bind(group.id).run();
    expect((await loadSent(env.DB, await reload(env, manageToken))).get(ann.id)).toBeUndefined();
  });
});

describe('recovery and sweeping', () => {
  it('deletes only expired groups', async () => {
    const env = makeEnv();
    await seedGroup(env);
    expect(await deleteExpired(env.DB, new Date('2027-01-31T23:59:59Z'))).toBe(0);
    expect(await deleteExpired(env.DB, new Date('2027-02-01T00:00:00Z'))).toBe(1);
  });

  it('lists live groups with reminders on', async () => {
    const env = makeEnv();
    await seedGroup(env);
    const on = await seedGroup(env, { remindersEnabled: true });
    expect((await reminderGroups(env.DB, NOW)).map(g => g.id)).toEqual([on.group.id]);
  });
});
