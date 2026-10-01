// Isolated actual local D1, with provider networking stubbed in the calling
// process. No credentials from .dev.vars are passed to the email code.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import schema from '../../migrations/0001_init.sql?raw';
import guards from '../../migrations/0002_write_guards.sql?raw';
import emailSchema from '../../migrations/0003_email_operations.sql?raw';
import type { Env } from '../../functions/_shared/env';
import { seedGroup, NOW } from '../helpers/fixtures';
import { TEST_LINK_KEY } from '../helpers/env';
import { sendToParticipants, deliverOperation } from '../../functions/_shared/sending';
import { recoverGroups } from '../../functions/_shared/recovery';
import { claimEmail, type EmailOperation } from '../../functions/_shared/emailRepo';
import { findGroupByManageToken, deleteExpired } from '../../functions/_shared/repo';
import { sweep } from '../../functions/_shared/sweep';
import { openToken } from '../../functions/_shared/tokens';

let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
let env: Env;
beforeAll(async () => {
  proxy = await getPlatformProxy({ persist: false });
  env = { DB: (proxy.env as { DB: Env['DB'] }).DB, LINK_KEY: TEST_LINK_KEY, RESEND_API_KEY: 're_fake', EMAIL_FROM: 'Secret Santa <test@example.com>' };
  const statements = [schema, guards, emailSchema].flatMap(sql => sql.replace(/--[^\n]*/g, '').split(';').map(statement => statement.trim()).filter(Boolean));
  await env.DB.batch(statements.map(statement => env.DB.prepare(statement)));
});
afterEach(async () => { vi.useRealTimers(); vi.unstubAllGlobals(); await env.DB.prepare('DELETE FROM groups').run(); });
afterAll(async () => { await proxy?.dispose(); });

function provider() {
  let fail = false;
  const requests: { key: string; body: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    requests.push({ key: (init.headers as Record<string,string>)['Idempotency-Key'], body: init.body as string });
    return fail ? new Response('{}', { status: 503 }) : Response.json({ data: [{ id: 'fake-id' }] });
  }));
  return { requests, setFailure: (value: boolean) => { fail = value; } };
}

describe('email operations against actual local D1', () => {
  it('serialises claims, logs once, retries stable payloads and expires all state', async () => {
    vi.setSystemTime(NOW);
    const { group } = await seedGroup(env);
    const fake = provider(); fake.setFailure(true);
    await sendToParticipants(env, group, 'link');
    const operation = (await env.DB.prepare('SELECT * FROM email_operations ORDER BY participant_id LIMIT 1').first<EmailOperation>())!;
    const claims = await Promise.all([claimEmail(env.DB, operation.id, NOW), claimEmail(env.DB, operation.id, NOW)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    vi.setSystemTime(new Date(NOW.getTime() + 61_000));
    fake.setFailure(false);
    expect(await deliverOperation(env, operation)).toBe(true);
    const calls = fake.requests.filter(request => request.key.endsWith(operation.id));
    expect(calls[0]).toEqual(calls[1]);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 1 });
    await deleteExpired(env.DB, new Date(group.expires_at));
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM email_operations').first()).toEqual({ n: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 0 });
  });
  it('sweeps overlapping reminders once and cascades their state on expiry', async () => {
    const now = new Date('2026-12-13T01:00:00Z'); vi.setSystemTime(now);
    const { group } = await seedGroup(env, { remindersEnabled: true });
    const fake = provider();
    await Promise.all([sweep(env, now), sweep(env, now)]);
    await sweep(env, now);
    expect(fake.requests).toHaveLength(2);
    expect(new Set(fake.requests.map(request => request.key)).size).toBe(2);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 2 });
    expect((await sweep(env, new Date(group.expires_at))).deletedGroups).toBe(1);
    for (const table of ['participants', 'pairings', 'send_log', 'email_operations']) {
      expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).toEqual({ n: 0 });
    }
  });
  it('keeps old access on failure and atomically rotates a shared pending recovery', async () => {
    vi.setSystemTime(NOW);
    const { manageToken } = await seedGroup(env);
    const fake = provider(); fake.setFailure(true);
    await recoverGroups(env, 'org@example.com');
    const operation = (await env.DB.prepare('SELECT * FROM email_operations').first<EmailOperation>())!;
    const token = /\/manage\/([A-Za-z0-9]{22})/.exec(await openToken(operation.payload_sealed!, env.LINK_KEY))![1];
    expect(await findGroupByManageToken(env.DB, manageToken, NOW)).not.toBeNull();
    expect(await findGroupByManageToken(env.DB, token, NOW)).not.toBeNull();
    fake.setFailure(false);
    await Promise.all([deliverOperation(env, operation), deliverOperation(env, operation)]);
    expect(await findGroupByManageToken(env.DB, manageToken, NOW)).toBeNull();
    expect(await findGroupByManageToken(env.DB, token, NOW)).not.toBeNull();
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 1 });
  });
});
