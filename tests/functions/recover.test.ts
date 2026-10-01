import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recover } from '../../functions/_shared/emailApi';
import { makeEnv, req, stubFetch, ORIGIN } from '../helpers/env';
import { NOW, seedGroup } from '../helpers/fixtures';
import { findGroupByManageToken, loadExportSnapshot } from '../../functions/_shared/repo';
import { openToken } from '../../functions/_shared/tokens';
import { deliverOperation } from '../../functions/_shared/sending';
import type { EmailOperation } from '../../functions/_shared/emailRepo';

beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const run = (env: ReturnType<typeof makeEnv>, email = 'org@example.com', origin?: string | null) => recover({ env, params: {}, request: req('POST', '/api/recover', { email, turnstileToken: 'test' }, origin) });
const tokenIn = (text: string) => /\/manage\/([A-Za-z0-9]{22})/.exec(text)![1];

async function fixture() {
  const env = makeEnv(); const provider = stubFetch();
  return { env, provider, ...await seedGroup(env) };
}

describe('organiser recovery', () => {
  it('returns the same 202 for missing, existing and failed delivery', async () => {
    const { env, provider, manageToken } = await fixture();
    const missing = await run(env, 'missing@example.com');
    provider.failResend(503);
    const failed = await run(env);
    expect(missing.status).toBe(202);
    expect(failed.status).toBe(202);
    expect(await missing.json()).toEqual(await failed.json());
    expect(await findGroupByManageToken(env.DB, manageToken, NOW)).not.toBeNull();
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 0 });
    provider.failResend(200);
    const success = await run(env);
    expect(success.status).toBe(202);
    expect(await success.json()).toEqual({ accepted: true });
    expect(await findGroupByManageToken(env.DB, manageToken, NOW)).toBeNull();
    const token = tokenIn(JSON.stringify(provider.resendCalls[0]));
    expect(await findGroupByManageToken(env.DB, token, NOW)).not.toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM send_log WHERE kind='recovery'").first()).toEqual({ n: 1 });
  });
  it('makes the pending emailed token usable before rotation, including exports', async () => {
    const { env, provider, manageToken } = await fixture();
    provider.failResend(503);
    await run(env);
    const operation = (await env.DB.prepare('SELECT * FROM email_operations').first<EmailOperation>())!;
    const token = tokenIn(await openToken(operation.payload_sealed!, env.LINK_KEY));
    expect(await findGroupByManageToken(env.DB, token, NOW)).not.toBeNull();
    expect(await findGroupByManageToken(env.DB, manageToken, NOW)).not.toBeNull();
    expect(await loadExportSnapshot(env.DB, token, 'json', NOW)).not.toBeNull();
    provider.failResend(200);
    expect(await deliverOperation(env, operation)).toBe(true);
    expect(await findGroupByManageToken(env.DB, manageToken, NOW)).toBeNull();
    expect(await findGroupByManageToken(env.DB, token, NOW)).not.toBeNull();
    expect((await env.DB.prepare('SELECT payload_sealed FROM email_operations').first())?.payload_sealed).toBeNull();
  });
  it('coordinates concurrent recoveries using one replacement and one send', async () => {
    const { env, provider, manageToken } = await fixture();
    const responses = await Promise.all([run(env), run(env)]);
    expect(responses.map(response => response.status)).toEqual([202,202]);
    expect(provider.resendCalls).toHaveLength(1);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM email_operations').first()).toEqual({ n: 1 });
    expect(await findGroupByManageToken(env.DB, manageToken, NOW)).toBeNull();
  });
  it('uses each stored site origin, matches email case insensitively and skips expired groups', async () => {
    const { env, provider, group } = await fixture();
    const second = await seedGroup(env);
    const expired = await seedGroup(env);
    await env.DB.prepare("UPDATE groups SET site_origin='https://preview.test' WHERE id=?").bind(second.group.id).run();
    await env.DB.prepare('UPDATE groups SET expires_at=? WHERE id=?').bind(NOW.toISOString(), expired.group.id).run();
    await run(env, 'ORG@example.com');
    expect(provider.resendCalls).toHaveLength(2);
    const text = JSON.stringify(provider.resendCalls);
    expect(text).toContain(`${ORIGIN}/manage/`);
    expect(text).toContain('https://preview.test/manage/');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log WHERE group_id=?').bind(group.id).first()).toEqual({ n: 1 });
  });
  it('revokes stale aliases on email changes and cascades all pending state', async () => {
    const { env, provider, group, manageToken } = await fixture();
    provider.failResend(503);
    await run(env);
    const operation = (await env.DB.prepare('SELECT * FROM email_operations').first<EmailOperation>())!;
    const token = tokenIn(await openToken(operation.payload_sealed!, env.LINK_KEY));
    await env.DB.prepare("UPDATE groups SET organiser_email='other@example.com' WHERE id=?").bind(group.id).run();
    expect(await findGroupByManageToken(env.DB, token, NOW)).toBeNull();
    provider.failResend(200);
    expect(await deliverOperation(env, operation)).toBe(false);
    expect(await findGroupByManageToken(env.DB, manageToken, NOW)).not.toBeNull();
    await env.DB.prepare('DELETE FROM groups WHERE id=?').bind(group.id).run();
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM email_operations').first()).toEqual({ n: 0 });
    expect(await findGroupByManageToken(env.DB, token, NOW)).toBeNull();
  });
  it('never replays a quarantined recovery, but a new request replaces it', async () => {
    const { env, provider, manageToken } = await fixture();
    provider.failResend(503);
    await run(env);
    const stuck = (await env.DB.prepare('SELECT * FROM email_operations').first<EmailOperation>())!;
    const later = new Date(NOW.getTime() + 24 * 3600_000); vi.setSystemTime(later);
    provider.failResend(200);
    expect(await deliverOperation(env, stuck)).toBe(false);
    expect(provider.resendCalls).toHaveLength(0);
    expect(await findGroupByManageToken(env.DB, manageToken, later)).not.toBeNull();
    await run(env);
    expect(provider.resendCalls).toHaveLength(1);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM email_operations WHERE id=?').bind(stuck.id).first()).toEqual({ n: 0 });
    expect(await findGroupByManageToken(env.DB, manageToken, later)).toBeNull();
    expect(await findGroupByManageToken(env.DB, tokenIn(JSON.stringify(provider.resendCalls[0])), later)).not.toBeNull();
  });
  it('recovers to a changed organiser email while an older recovery is pending', async () => {
    const { env, provider, group } = await fixture();
    provider.failResend(503);
    await run(env);
    await env.DB.prepare("UPDATE groups SET organiser_email='new@example.com',revision=revision+1 WHERE id=?").bind(group.id).run();
    provider.failResend(200);
    await run(env, 'new@example.com');
    expect(provider.resendCalls).toHaveLength(1);
    expect(JSON.stringify(provider.resendCalls[0])).toContain('new@example.com');
    expect(JSON.stringify(provider.resendCalls[0])).not.toContain('org@example.com');
  });
  it('replies before delivery finishes when the runtime provides waitUntil', async () => {
    const { env } = await fixture();
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    let resendCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.startsWith('https://challenges.cloudflare.com/')) return Response.json({ success: true });
      resendCalls++; await gate;
      return Response.json({ data: (JSON.parse(init.body as string) as unknown[]).map((_, i) => ({ id: `e${i}` })) });
    }));
    const background: Promise<unknown>[] = [];
    const response = await recover({ env, params: {}, request: req('POST', '/api/recover', { email: 'org@example.com', turnstileToken: 'test' }), waitUntil: promise => { background.push(promise); } });
    expect(response.status).toBe(202);
    expect(background).toHaveLength(1);
    release(); await Promise.all(background);
    expect(resendCalls).toBe(1);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM send_log WHERE kind='recovery'").first()).toEqual({ n: 1 });
  });
  it('validates origin, address and bot check and disables consistently', async () => {
    const { env, provider } = await fixture();
    expect((await run(env, 'bad')).status).toBe(400);
    expect((await run(env, 'org@example.com', null)).status).toBe(403);
    provider.turnstileOk(false);
    expect((await run(env)).status).toBe(403);
    env.RESEND_API_KEY = undefined;
    expect((await run(env)).status).toBe(503);
    expect((await run(env, 'missing@example.com')).status).toBe(503);
    expect(provider.resendCalls).toHaveLength(0);
  });
});
