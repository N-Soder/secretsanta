import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnv, stubFetch } from '../helpers/env';
import { NOW, seedGroup, SETTINGS } from '../helpers/fixtures';
import { sendToParticipants, deliverOperation } from '../../functions/_shared/sending';
import { createGroup } from '../../functions/_shared/repo';
import { claimEmail, type EmailOperation } from '../../functions/_shared/emailRepo';
import { openToken } from '../../functions/_shared/tokens';

beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function fixture() {
  const env = makeEnv(); const provider = stubFetch();
  return { env, provider, ...await seedGroup(env) };
}
async function operations(env: ReturnType<typeof makeEnv>) {
  return (await env.DB.prepare('SELECT * FROM email_operations ORDER BY rowid').all<EmailOperation>()).results;
}

describe('durable recipient sending', () => {
  it('sends the maximum 100-person group within the free D1 query budget', async () => {
    const env = makeEnv(); const provider = stubFetch();
    const people = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}`, hint: '', email: `p${i}@example.com`, rules: [] }));
    const created = await createGroup(env.DB, { settings: SETTINGS, participants: people, pairs: new Map(people.map((person, i) => [person.id, people[(i+1)%people.length].id])), linkKey: env.LINK_KEY, origin: 'https://site.test', now: NOW });
    const group = (await env.DB.prepare('SELECT * FROM groups WHERE id=?').bind(created.groupId).first()) as unknown as Parameters<typeof sendToParticipants>[1];
    const original = env.DB.prepare.bind(env.DB);
    const prepare = vi.spyOn(env.DB, 'prepare').mockImplementation(original);
    const results = await sendToParticipants(env, group, 'link');
    expect(results).toHaveLength(100);
    expect(results.every(result => result.ok)).toBe(true);
    expect(provider.resendCalls).toHaveLength(100);
    expect(prepare.mock.calls.length).toBeLessThan(30);
  });

  it('deduplicates reminders independently per kind and draw', async () => {
    const { env, group, provider } = await fixture();
    await Promise.all([sendToParticipants(env, group, 'reminder_7d'), sendToParticipants(env, group, 'reminder_7d')]);
    expect(provider.resendCalls).toHaveLength(2);
    await sendToParticipants(env, group, 'reminder_1d');
    expect(provider.resendCalls).toHaveLength(4);
  });

  it('sends addressed people, erases successful payloads, and skips only the current draw', async () => {
    const { env, group, provider } = await fixture();
    expect((await sendToParticipants(env, group, 'link')).map(result => result.ok)).toEqual([true, true]);
    expect(provider.resendCalls).toHaveLength(2);
    expect(await sendToParticipants(env, group, 'link')).toEqual([]);
    const rows = await operations(env);
    expect(rows.every(row => row.state === 'sent' && row.payload_sealed === null)).toBe(true);
    await env.DB.prepare('UPDATE groups SET draw_version=2,revision=2').run();
    await sendToParticipants(env, { ...group, draw_version: 2, revision: 2 }, 'link');
    expect(provider.resendCalls).toHaveLength(4);
  });

  it('serialises overlapping default requests and issues fresh keys for successful explicit resends', async () => {
    const { env, group, provider } = await fixture();
    await Promise.all([sendToParticipants(env, group, 'link'), sendToParticipants(env, group, 'link')]);
    expect(provider.resendCalls).toHaveLength(2);
    const rows = await operations(env);
    const id = rows[0].participant_id!;
    await sendToParticipants(env, group, 'link', [id]);
    await sendToParticipants(env, group, 'link', [id]);
    expect(provider.resendCalls).toHaveLength(4);
    expect(new Set((await operations(env)).map(row => row.id)).size).toBe(4);
  });

  it('retries mixed failures with the original sealed payload and key after edits', async () => {
    const { env, group } = await fixture();
    const requests: { key: string; body: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      const body = init.body as string;
      requests.push({ key: (init.headers as Record<string,string>)['Idempotency-Key'], body });
      return body.includes('bob@example.com') && requests.length < 3 ? new Response('{}', { status: 503 }) : Response.json({ data: [{ id: 'ok' }] });
    }));
    const first = await sendToParticipants(env, group, 'link');
    expect(first.map(result => result.ok)).toEqual([true, false]);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 1 });
    const failed = (await operations(env)).find(row => row.state === 'pending')!;
    expect(failed.payload_sealed).not.toContain('bob@example.com');
    const payload = await openToken(failed.payload_sealed!, env.LINK_KEY);
    expect(payload).toContain('bob@example.com');
    await env.DB.prepare("UPDATE groups SET message='Changed',revision=2").run();
    const retry = await sendToParticipants(env, { ...group, message: 'Changed', revision: 2 }, 'link', [failed.participant_id!]);
    expect(retry[0].ok).toBe(true);
    expect(requests[2]).toEqual(requests[1]);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 2 });
  });

  it('replaces an unresolved send when the address is corrected', async () => {
    const { env, group, provider } = await fixture();
    provider.failResend(503);
    await sendToParticipants(env, group, 'link');
    const failed = (await operations(env))[0];
    await env.DB.prepare("UPDATE participants SET email='fixed@example.com' WHERE id=?").bind(failed.participant_id).run();
    provider.failResend(200);
    expect((await sendToParticipants(env, group, 'link', [failed.participant_id!]))[0].ok).toBe(true);
    expect(JSON.stringify(provider.resendCalls)).toContain('fixed@example.com');
    expect((await operations(env)).some(row => row.id === failed.id)).toBe(false);
  });

  it('lets an explicit resend replace a quarantined operation while default sends skip it', async () => {
    const { env, group, provider } = await fixture();
    provider.failResend(503);
    await sendToParticipants(env, group, 'link');
    vi.setSystemTime(new Date(NOW.getTime() + 24 * 3600_000));
    provider.failResend(200);
    expect((await sendToParticipants(env, group, 'link')).map(result => result.ok)).toEqual([false, false]);
    expect(provider.resendCalls).toHaveLength(0);
    const id = (await operations(env))[0].participant_id!;
    expect((await sendToParticipants(env, group, 'link', [id]))[0].ok).toBe(true);
    expect(provider.resendCalls).toHaveLength(1);
  });

  it('replays provider acceptance after a crash without changing its key or payload', async () => {
    const { env, group, provider } = await fixture();
    provider.failResend(503);
    await sendToParticipants(env, group, 'link');
    const operation = (await operations(env))[0];
    const claimed = await claimEmail(env.DB, operation.id, NOW);
    expect(claimed).not.toBeNull();
    // Simulate acceptance with no database completion, then an expired lease.
    const original = await openToken(claimed!.payload_sealed!, env.LINK_KEY);
    expect(await deliverOperation(env, operation)).toBe(false);
    vi.setSystemTime(new Date(NOW.getTime() + 61_000));
    provider.failResend(200);
    expect(await deliverOperation(env, operation)).toBe(true);
    expect(JSON.stringify(provider.resendCalls[0])).toBe(original);
    expect((await operations(env))[0].attempts).toBe(3);
  });

  it('reuses the provider identity when acceptance succeeds but completion crashes', async () => {
    const { env, group } = await fixture();
    const accepted = new Map<string, string>();
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      const key = (init.headers as Record<string,string>)['Idempotency-Key'];
      requests.push(key);
      if (accepted.has(key)) expect(init.body).toBe(accepted.get(key));
      else accepted.set(key, init.body as string);
      return Response.json({ data: [{ id: 'accepted' }] });
    }));
    const batch = vi.spyOn(env.DB, 'batch');
    batch.mockRejectedValueOnce(new Error('completion interrupted'));
    await expect(sendToParticipants(env, group, 'link')).rejects.toThrow('completion interrupted');
    expect(accepted.size).toBe(2);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 0 });
    vi.setSystemTime(new Date(NOW.getTime() + 61_000));
    expect((await sendToParticipants(env, group, 'link')).every(result => result.ok)).toBe(true);
    expect(accepted.size).toBe(2);
    expect(requests).toHaveLength(4);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 2 });
  });

  it('quarantines attempts before provider key expiry and rejects claims from old draws', async () => {
    const { env, group, provider } = await fixture();
    provider.failResend(503);
    await sendToParticipants(env, group, 'link');
    const operation = (await operations(env))[0];
    vi.setSystemTime(new Date(NOW.getTime() + 23 * 3600_000));
    provider.failResend(200);
    expect(await deliverOperation(env, operation)).toBe(false);
    expect((await operations(env))[0].state).toBe('uncertain');
    expect(provider.resendCalls).toHaveLength(0);
    vi.setSystemTime(NOW);
    await env.DB.prepare('UPDATE groups SET draw_version=2').run();
    expect(await deliverOperation(env, (await operations(env))[1])).toBe(false);
  });

  it('does not create operations from a stale snapshot, and cascades pending payloads', async () => {
    const { env, group, provider } = await fixture();
    await env.DB.prepare('UPDATE groups SET revision=2').run();
    expect((await sendToParticipants(env, group, 'link')).every(result => !result.ok)).toBe(true);
    expect(await operations(env)).toHaveLength(0);
    provider.failResend(503);
    await sendToParticipants(env, { ...group, revision: 2 }, 'link');
    await env.DB.prepare('DELETE FROM groups WHERE id=?').bind(group.id).run();
    expect(await operations(env)).toHaveLength(0);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log').first()).toEqual({ n: 0 });
  });
});
