import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportGroup } from '../../functions/_shared/exports';
import { deleteGroup, findParticipantByToken, loadExportSnapshot, loadPairings, saveWishlist } from '../../functions/_shared/repo';
import { parseHistoryCsv } from '../../src/utils/historyCsv';
import { parseParticipantsJson } from '../../src/utils/participantsJson';
import { makeEnv, ORIGIN, req } from '../helpers/env';
import { NOW, seedGroup } from '../helpers/fixtures';

beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => vi.useRealTimers());

async function fixture() {
  const env = makeEnv();
  const seeded = await seedGroup(env, { organiserEmail: 'org@example.com', budgetAmount: 2995 });
  const ann = (await findParticipantByToken(env.DB, seeded.tokens.Ann, NOW))!.participant;
  const bob = (await findParticipantByToken(env.DB, seeded.tokens.Bob, NOW))!.participant;
  await saveWishlist(env.DB, ann.id, 'DO NOT EXPORT THIS WISHLIST');
  await env.DB.prepare('INSERT INTO rules (group_id, giver_id, target_id, type, origin) VALUES (?, ?, ?, ?, ?)').bind(seeded.group.id, ann.id, bob.id, 'mustNot', 'history').run();
  const run = (format: string | null, token = seeded.manageToken) => exportGroup({
    env, params: { token }, request: req('GET', `/api/manage/${token}/export${format === null ? '' : `?format=${format}`}`),
  });
  return { env, ...seeded, ann, bob, run };
}

describe('authenticated exports', () => {
  it('downloads history v2 with real pairings, settings and email, without links or wishlists', async () => {
    const { env, group, tokens, run } = await fixture();
    const response = await run('history');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="secret-santa-history-2026-10-01.csv"');
    const text = await response.text();
    expect(text).not.toMatch(/DO NOT EXPORT|wishlist|link_token|private_link|instructions|https?:\/\//);
    for (const token of Object.values(tokens)) expect(text).not.toContain(token);
    const parsed = parseHistoryCsv(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.settings).toEqual({ message: 'Bring a card', budgetAmount: 2995, budgetCurrency: 'AUD', eventDate: '2026-12-20', organiserEmail: null });
    expect(Object.values(parsed.data.participants).find(person => person.name === 'Ann')?.email).toBe('ann@example.com');
    expect(new Map(parsed.data.pastPairings.map(pair => [pair.giverId, pair.receiverId]))).toEqual(await loadPairings(env.DB, group.id));
  });

  it('downloads links CSV with persistent server links from the group origin', async () => {
    const { run, tokens } = await fixture();
    const response = await run('links');
    expect(response.headers.get('Content-Disposition')).toContain('secret-santa-links-2026-10-01.csv');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(`name,email,link\r\nAnn,ann@example.com,${ORIGIN}/s/${tokens.Ann}\r\nBob,bob@example.com,${ORIGIN}/s/${tokens.Bob}\r\nCat,,${ORIGIN}/s/${tokens.Cat}\r\n`);
  });

  it('downloads reimportable JSON with all active rules and no secret content', async () => {
    const { run, tokens, manageToken } = await fixture();
    const response = await run('json');
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    const text = await response.text();
    const body = JSON.parse(text);
    expect(body.budget).toBe(29.95);
    expect(body.organiserEmail).toBe('org@example.com');
    expect(body.participants.find((person: { name: string }) => person.name === 'Ann').mustNotGiveTo).toEqual(['Bob']);
    expect(text).not.toMatch(/DO NOT EXPORT|wishlist|receiver|pairing|link|token|first_viewed|sent_at|"id"/);
    for (const token of [manageToken, ...Object.values(tokens)]) expect(text).not.toContain(token);
    const parsed = parseParticipantsJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const ann = Object.values(parsed.data.participants).find(person => person.name === 'Ann')!;
    const bob = Object.values(parsed.data.participants).find(person => person.name === 'Bob')!;
    expect(ann.rules).toEqual([{ type: 'mustNot', targetParticipantId: bob.id }]);
  });

  it.each(['history', 'links', 'json'])('protects %s against caching and invalid authentication', async format => {
    const { run, tokens, env, group } = await fixture();
    const good = await run(format);
    expect(good.headers.get('Cache-Control')).toBe('no-store');
    expect(good.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(good.headers.get('X-Content-Type-Options')).toBe('nosniff');
    for (const token of ['bad', 'x'.repeat(22), tokens.Ann]) {
      const response = await run(format, token);
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    vi.setSystemTime(new Date(group.expires_at));
    expect((await run(format)).status).toBe(404);
    vi.setSystemTime(NOW);
    await deleteGroup(env.DB, group.id);
    expect((await run(format)).status).toBe(404);
  });

  it('rejects missing and unknown formats without distinguishing nonexistent groups', async () => {
    const { run } = await fixture();
    for (const format of [null, '', 'csv', 'private']) {
      const response = await run(format);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid', field: 'format' });
      expect((await run(format, 'x'.repeat(22))).status).toBe(404);
    }
  });

  it('does not query or load pairings or sealed links into JSON snapshots', async () => {
    const { env, manageToken } = await fixture();
    const prepare = vi.spyOn(env.DB, 'prepare');
    const snapshot = await loadExportSnapshot(env.DB, manageToken, 'json', NOW);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.pairings).toEqual([]);
    expect(snapshot?.participants[0]).not.toHaveProperty('wishlist');
    expect(snapshot?.participants[0]).not.toHaveProperty('link_token_sealed');
    expect(prepare.mock.calls.some(([sql]) => /FROM pairings/.test(sql))).toBe(false);
  });
});
