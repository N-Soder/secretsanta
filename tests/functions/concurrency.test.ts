import { describe, expect, it } from 'vitest';
import { applyPatch, buildManageView, findGroupByManageToken, loadPairings, markViewed, MutationConflict, replaceDraw, saveWishlist } from '../../functions/_shared/repo';
import { makeEnv } from '../helpers/env';
import { NOW, seedGroup } from '../helpers/fixtures';

async function draft() {
  const env = makeEnv();
  const seeded = await seedGroup(env);
  const view = await buildManageView(env.DB, seeded.group, env.LINK_KEY, true);
  const people = view.participants.map(({ id, name, hint, email, rules }) => ({ id, name, hint, email, rules }));
  const pairs = new Map(people.map((person, index) => [person.id, people[(index + 1) % people.length].id]));
  return { env, ...seeded, view, people, pairs };
}

describe('atomic group mutations', () => {
  it('lets only one of two simultaneous redraws commit', async () => {
    const { env, group, people, pairs } = await draft();
    const results = await Promise.allSettled([
      replaceDraw(env.DB, group, people, pairs, env.LINK_KEY),
      replaceDraw(env.DB, group, people, pairs, env.LINK_KEY),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(result => result.status === 'rejected');
    expect(failed && failed.status === 'rejected' && failed.reason).toBeInstanceOf(MutationConflict);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM write_guards').first()).toEqual({ n: 0 });
  });

  it('refuses a redraw when a participant opens after the organiser loaded the group', async () => {
    const { env, group, people, pairs } = await draft();
    const before = await loadPairings(env.DB, group.id);
    await markViewed(env.DB, people[0].id, NOW);
    await expect(replaceDraw(env.DB, group, people, pairs, env.LINK_KEY)).rejects.toMatchObject({ reason: 'needsConfirm' });
    expect(await loadPairings(env.DB, group.id)).toEqual(before);
    expect(await env.DB.prepare('SELECT draw_version FROM groups WHERE id = ?').bind(group.id).first()).toEqual({ draw_version: 1 });
  });

  it('preserves a wishlist written after the redraw draft was loaded', async () => {
    const { env, group, people, pairs } = await draft();
    await saveWishlist(env.DB, people[0].id, 'Latest wish');
    await replaceDraw(env.DB, group, people, pairs, env.LINK_KEY, true);
    expect(await env.DB.prepare('SELECT wishlist FROM participants WHERE id = ?').bind(people[0].id).first()).toEqual({ wishlist: 'Latest wish' });
  });

  it('rejects a stale safe patch and permits an atomic name swap', async () => {
    const { env, group, people, manageToken } = await draft();
    await applyPatch(env.DB, group, { participants: [{ id: people[0].id, name: people[1].name }, { id: people[1].id, name: people[0].name }] });
    await expect(applyPatch(env.DB, group, { settings: { message: 'Stale' } })).rejects.toMatchObject({ reason: 'stale' });
    const fresh = (await findGroupByManageToken(env.DB, manageToken, NOW))!;
    expect(fresh.message).toBe('Bring a card');
    expect((await buildManageView(env.DB, fresh, env.LINK_KEY, true)).participants.find(person => person.id === people[0].id)?.name).toBe(people[1].name);
  });

  it('rejects reminders if an edit removes every email address', async () => {
    const { env, group, people } = await draft();
    expect(await applyPatch(env.DB, group, { settings: { remindersEnabled: true }, participants: people.map(person => ({ id: person.id, email: null })) })).toEqual({ ok: false, field: 'settings.remindersEnabled' });
    expect(await env.DB.prepare('SELECT reminders_enabled FROM groups WHERE id = ?').bind(group.id).first()).toEqual({ reminders_enabled: 0 });
  });
});
