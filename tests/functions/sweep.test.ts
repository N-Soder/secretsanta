import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnv, stubFetch } from '../helpers/env';
import { seedGroup } from '../helpers/fixtures';
import { sweep } from '../../functions/_shared/sweep';
import worker from '../../workers/sweeper';

const DUE = new Date('2026-12-13T01:00:00Z');
beforeEach(() => vi.setSystemTime(DUE));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function fixture() {
  const env = makeEnv(); const provider = stubFetch();
  return { env, provider, ...await seedGroup(env, { remindersEnabled: true }) };
}

describe('hourly sweeper', () => {
  it('deletes expired groups and cascades encrypted pending state even with email disabled', async () => {
    const { env, group, provider } = await fixture();
    provider.failResend(503);
    await sweep(env, DUE);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM email_operations').first()).toEqual({ n: 2 });
    const result = await sweep({ ...env, RESEND_API_KEY: undefined }, new Date(group.expires_at));
    expect(result.deletedGroups).toBe(1);
    for (const table of ['participants', 'pairings', 'rules', 'send_log', 'email_operations']) {
      expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).toEqual({ n: 0 });
    }
  });

  it.each([
    ['2026-12-13T00:59:00Z', 'Australia/Perth', '2026-12-20', null],
    ['2026-12-13T01:00:00Z', 'Australia/Perth', '2026-12-20', 'reminder_7d'],
    ['2026-12-18T22:00:00Z', 'Australia/Sydney', '2026-12-20', 'reminder_1d'],
    ['2026-12-19T16:00:00Z', 'Australia/Perth', '2026-12-20', null],
    ['2026-12-13T16:00:00Z', 'Australia/Perth', '2026-12-20', null],
    ['2026-10-25T06:59:00Z', 'Europe/Helsinki', '2026-10-26', null],
    ['2026-10-25T07:00:00Z', 'Europe/Helsinki', '2026-10-26', 'reminder_1d'],
  ])('at %s in %s selects %s → %s', async (stamp, timezone, eventDate, kind) => {
    const env = makeEnv(); const provider = stubFetch(); const now = new Date(stamp); vi.setSystemTime(now);
    await seedGroup(env, { remindersEnabled: true, timezone, eventDate });
    const result = await sweep(env, now);
    expect(result.reminderSuccesses).toBe(kind ? 2 : 0);
    expect(provider.resendCalls).toHaveLength(kind ? 2 : 0);
    expect((await env.DB.prepare('SELECT DISTINCT kind FROM send_log').all()).results).toEqual(kind ? [{ kind }] : []);
  });

  it('skips off, undated, unaddressed groups and missing mail configuration', async () => {
    const env = makeEnv(); const provider = stubFetch();
    await seedGroup(env);
    await seedGroup(env, { remindersEnabled: true, eventDate: null });
    const { group } = await seedGroup(env, { remindersEnabled: true });
    await env.DB.prepare('UPDATE participants SET email=NULL WHERE group_id=?').bind(group.id).run();
    expect((await sweep(env, DUE)).reminderAttempts).toBe(0);
    await seedGroup(env, { remindersEnabled: true });
    for (const overrides of [{ RESEND_API_KEY: undefined }, { EMAIL_FROM: undefined }]) {
      expect((await sweep({ ...env, ...overrides }, DUE)).reminderAttempts).toBe(0);
    }
    expect(provider.resendCalls).toHaveLength(0);
  });

  it('deduplicates repeat and overlapping runs, date edits, and separates new draws', async () => {
    const { env, provider, group } = await fixture();
    await Promise.all([sweep(env, DUE), sweep(env, DUE)]);
    expect(provider.resendCalls).toHaveLength(2);
    expect((await sweep(env, DUE)).reminderAttempts).toBe(0);
    // Moving the date closer never sends a late "in 7 days".
    await env.DB.prepare("UPDATE groups SET event_date='2026-12-19',revision=2 WHERE id=?").bind(group.id).run();
    expect((await sweep(env, DUE)).reminderAttempts).toBe(0);
    await env.DB.prepare("UPDATE groups SET event_date='2026-12-20',revision=3 WHERE id=?").bind(group.id).run();
    expect((await sweep(env, DUE)).reminderAttempts).toBe(0);
    expect(provider.resendCalls).toHaveLength(2);
    await env.DB.prepare('UPDATE groups SET draw_version=2,revision=4 WHERE id=?').bind(group.id).run();
    expect((await sweep(env, DUE)).reminderSuccesses).toBe(2);
    expect(provider.resendCalls).toHaveLength(4);
  });

  it('retries failures with the same identity, but never after the reminder’s day', async () => {
    const { env } = await fixture(); const requests: { key: string; body: string }[] = []; let fail = true;
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      requests.push({ key: (init.headers as Record<string, string>)['Idempotency-Key'], body: init.body as string });
      return fail ? new Response('{}', { status: 503 }) : Response.json({ data: [{ id: 'accepted' }] });
    }));
    expect((await sweep(env, DUE)).reminderFailures).toBe(2);
    fail = false;
    expect((await sweep(env, DUE)).reminderSuccesses).toBe(2);
    expect(requests.slice(2)).toEqual(requests.slice(0, 2));
    await env.DB.prepare("UPDATE groups SET draw_version=2,revision=2").run(); fail = true;
    await sweep(env, DUE);
    // 00:00 Perth the next day: the 7-day reminder is no longer due.
    const later = new Date(DUE.getTime() + 15 * 3600_000); vi.setSystemTime(later); fail = false;
    expect((await sweep(env, later)).reminderAttempts).toBe(0);
    expect(requests).toHaveLength(6);
  });

  it('continues after one group crashes, then replays accepted but unlogged requests safely', async () => {
    const { env } = await fixture(); await seedGroup(env, { remindersEnabled: true });
    const accepted = new Map<string, string>(); const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      const key = (init.headers as Record<string,string>)['Idempotency-Key']; requests.push(key);
      if (accepted.has(key)) expect(init.body).toBe(accepted.get(key));
      accepted.set(key, init.body as string);
      return Response.json({ data: [{ id: 'accepted' }] });
    }));
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('private database error'));
    expect((await sweep(env, DUE)).groupFailures).toBe(1);
    expect(accepted.size).toBe(4);
    const later = new Date(DUE.getTime() + 61_000); vi.setSystemTime(later);
    expect((await sweep(env, later)).reminderSuccesses).toBe(2);
    expect(accepted.size).toBe(4); expect(requests).toHaveLength(6);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 4 });
  });

  it('scans beyond a bounded page without skipping groups', async () => {
    const env = makeEnv(); const provider = stubFetch();
    for (let i = 0; i < 21; i++) await seedGroup(env, { remindersEnabled: true });
    expect((await sweep(env, DUE)).reminderSuccesses).toBe(42);
    expect(provider.resendCalls).toHaveLength(42);
  });

  it('registers scheduled work with waitUntil and exposes no HTTP handler', async () => {
    const env = makeEnv({ RESEND_API_KEY: undefined }); await seedGroup(env);
    const waitUntil = vi.fn(); worker.scheduled({}, env, { waitUntil });
    await waitUntil.mock.calls[0][0];
    expect('fetch' in worker).toBe(false);
  });
});
