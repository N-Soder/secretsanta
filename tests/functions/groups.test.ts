import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create, getManage, patchManage, redraw, remove } from '../../functions/_shared/groupApi';
import { makeEnv, req, stubFetch } from '../helpers/env';
import { NOW, PEOPLE, SETTINGS } from '../helpers/fixtures';
import type { ManageView } from '../../src/api/types';

beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function fixture() {
  const env = makeEnv();
  stubFetch();
  const request = req('POST', '/api/groups', { settings: SETTINGS, participants: PEOPLE, turnstileToken: 'test' });
  const response = await create({ env, request, params: {} });
  const body = await response.json() as { manageToken: string; participants: { id: string; link: string }[] };
  const ctx = { env, params: { token: body.manageToken }, request: req('GET', `/api/manage/${body.manageToken}`) };
  return { response, body, ctx };
}

describe('create and organiser API', () => {
  it('creates with participant links and returns a safe organiser view', async () => {
    const { response, body, ctx } = await fixture();
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.manageToken).toMatch(/^[A-Za-z0-9]{22}$/);
    expect(body.participants).toHaveLength(3);
    const result = await getManage(ctx);
    const view = await result.json() as ManageView;
    expect(view.revision).toBe(1);
    expect(view.participants).toHaveLength(3);
    expect(JSON.stringify(view)).not.toMatch(/receiver|pairings|wishlist/);
  });

  it('validates Origin, body, settings and Turnstile before writing', async () => {
    const env = makeEnv();
    const fetch = stubFetch();
    const run = (request: Request) => create({ env, request, params: {} });
    expect((await run(req('POST', '/api/groups', {}, null))).status).toBe(403);
    expect((await run(req('POST', '/api/groups', '{bad'))).status).toBe(400);
    expect((await run(req('POST', '/api/groups', 'x'.repeat(65537)))).status).toBe(413);
    expect((await run(req('POST', '/api/groups', { settings: {} }))).status).toBe(400);
    fetch.turnstileOk(false);
    expect((await run(req('POST', '/api/groups', { settings: SETTINGS, participants: PEOPLE, turnstileToken: 'test' }))).status).toBe(403);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM groups').first()).toEqual({ n: 0 });
  });

  it('does not persist an impossible draw', async () => {
    const env = makeEnv(); stubFetch();
    const people = PEOPLE.map(person => ({ ...person, rules: PEOPLE.filter(other => other.id !== person.id).map(other => ({ type: 'mustNot', targetParticipantId: other.id })) }));
    const response = await create({ env, params: {}, request: req('POST', '/api/groups', { settings: SETTINGS, participants: people, turnstileToken: 'test' }) });
    expect(response.status).toBe(422);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM groups').first()).toEqual({ n: 0 });
  });

  it('patches only sent fields and rejects a stale revision', async () => {
    const { ctx } = await fixture();
    const run = (body: unknown) => patchManage({ ...ctx, request: req('PATCH', '/api/manage/x', body) });
    const response = await run({ revision: 1, settings: { message: 'New message' } });
    expect(response.status).toBe(200);
    const view = await response.json() as ManageView;
    expect(view.settings.message).toBe('New message');
    expect(view.settings.budgetAmount).toBe(3000);
    expect(view.revision).toBe(2);
    expect((await run({ revision: 1, settings: { message: 'stale' } })).status).toBe(409);
  });

  it('requires confirmation after an opening and rejects an old draw version', async () => {
    const { ctx } = await fixture();
    const view = await (await getManage(ctx)).json() as ManageView;
    await ctx.env.DB.prepare('UPDATE participants SET first_viewed_at = ? WHERE id = ?').bind(NOW.toISOString(), view.participants[0].id).run();
    const people = view.participants.map(({ id, name, hint, email, rules }) => ({ id, name, hint, email, rules }));
    const run = (confirm: boolean) => redraw({ ...ctx, request: req('POST', '/api/manage/x/redraw', { drawVersion: 1, participants: people, confirm }) });
    const refused = await run(false);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'needsConfirm', viewedCount: 1 });
    const accepted = await run(true);
    expect(accepted.status).toBe(200);
    expect((await accepted.json() as ManageView).drawVersion).toBe(2);
    expect((await run(true)).status).toBe(409);
  });

  it('deletes, expires and rejects malformed tokens uniformly', async () => {
    const { ctx } = await fixture();
    expect((await getManage({ ...ctx, params: { token: 'bad' } })).status).toBe(404);
    expect((await remove({ ...ctx, request: req('DELETE', '/api/manage/x') })).status).toBe(204);
    expect((await getManage(ctx)).status).toBe(404);
    expect(await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM pairings').first()).toEqual({ n: 0 });
  });
});
