import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { send } from '../../functions/_shared/emailApi';
import { makeEnv, req, stubFetch } from '../helpers/env';
import { NOW, seedGroup } from '../helpers/fixtures';
import { loadParticipants } from '../../functions/_shared/repo';

beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function fixture() {
  const env = makeEnv(); const provider = stubFetch();
  const { group, manageToken } = await seedGroup(env);
  const run = (body: unknown, token = manageToken, origin?: string | null) => send({ env, params: { token }, request: req('POST', `/api/manage/${token}/send`, body, origin) });
  return { env, provider, group, run };
}

describe('authenticated send endpoint', () => {
  it('sends current group recipients and returns only ids and outcomes', async () => {
    const { run, provider } = await fixture();
    const response = await run({ kind: 'link', turnstileToken: 'test' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body.results).toHaveLength(2);
    expect(body.results.every((result: object) => Object.keys(result).sort().join(',') === 'ok,participantId')).toBe(true);
    expect(provider.resendCalls).toHaveLength(2);
    expect(await (await run({ kind: 'link', turnstileToken: 'test' })).json()).toEqual({ results: [] });
  });
  it('rejects bad kind, duplicate, missing and cross-group ids before sending', async () => {
    const { env, run, group, provider } = await fixture();
    const people = await loadParticipants(env.DB, group.id);
    const other = await seedGroup(env);
    const foreign = (await loadParticipants(env.DB, other.group.id))[0].id;
    for (const body of [ { kind: 'reminder_7d' }, { kind: 'link', participantIds: [] }, { kind: 'link', participantIds: [people[0].id,people[0].id] }, { kind: 'link', participantIds: ['missing'] }, { kind: 'link', participantIds: [foreign] }, { kind: 'link', participantIds: null } ]) expect((await run({ ...body, turnstileToken: 'test' })).status).toBe(400);
    expect(provider.resendCalls).toHaveLength(0);
  });
  it('requires origin, valid auth and Turnstile, and consistently disables email', async () => {
    const { env, run, provider } = await fixture();
    const body = { kind: 'link', turnstileToken: 'test' };
    expect((await run(body, undefined, null)).status).toBe(403);
    expect((await run(body, 'bad')).status).toBe(404);
    provider.turnstileOk(false);
    expect((await run(body)).status).toBe(403);
    env.EMAIL_FROM = undefined;
    expect((await run(body)).status).toBe(503);
    expect(provider.resendCalls).toHaveLength(0);
  });
  it('returns individual failures without success logs', async () => {
    const { env, run, provider } = await fixture();
    provider.failResend(503);
    const response = await run({ kind: 'match_changed', turnstileToken: 'test' });
    expect(response.status).toBe(200);
    expect((await response.json()).results.every((result: { ok: boolean }) => !result.ok)).toBe(true);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 0 });
  });
});
