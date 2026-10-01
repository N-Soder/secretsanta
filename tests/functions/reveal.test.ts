import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reveal, wishlist } from '../../functions/_shared/participantApi';
import { findParticipantByToken } from '../../functions/_shared/repo';
import { makeEnv, req } from '../helpers/env';
import { NOW, seedGroup } from '../helpers/fixtures';

beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => vi.useRealTimers());

describe('participant endpoints', () => {
  it('shows the match wishlist and own wishlist without addresses or other matches', async () => {
    const env = makeEnv();
    const { tokens } = await seedGroup(env);
    const bob = { env, params: { token: tokens.Bob }, request: req('PUT', '/api/s/x/wishlist', { wishlist: 'Socks please' }) };
    expect((await wishlist(bob)).status).toBe(200);
    const result = await reveal({ env, params: { token: tokens.Ann }, request: req('GET', '/api/s/x') });
    const body = await result.json();
    expect(body.receiver).toEqual({ name: 'Bob', hint: '', wishlist: 'Socks please' });
    expect(body.ownWishlist).toBe('');
    expect(JSON.stringify(body)).not.toMatch(/Cat|example\.com|link_token|manage_token/);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });

  it('records the first GET once, and saving a wishlist alone does not mark a view', async () => {
    const env = makeEnv();
    const { tokens } = await seedGroup(env);
    const ctx = { env, params: { token: tokens.Ann }, request: req('PUT', '/api/s/x/wishlist', { wishlist: 'Tea' }) };
    await wishlist(ctx);
    expect((await findParticipantByToken(env.DB, tokens.Ann, NOW))?.participant.first_viewed_at).toBeNull();
    await reveal(ctx);
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    await reveal(ctx);
    expect((await findParticipantByToken(env.DB, tokens.Ann, NOW))?.participant.first_viewed_at).toBe(NOW.toISOString());
  });

  it('rejects invalid, expired, and organiser tokens, and validates wishlist writes', async () => {
    const env = makeEnv();
    const { tokens, manageToken } = await seedGroup(env);
    const run = (token: string, body: unknown, origin: string | null = 'https://secretsanta.test') => wishlist({ env, params: { token }, request: req('PUT', '/api/s/x/wishlist', body, origin) });
    expect((await run(tokens.Ann, { wishlist: 'hi' }, null)).status).toBe(403);
    expect((await run(tokens.Ann, { wishlist: 'x'.repeat(1001) })).status).toBe(400);
    expect((await run(manageToken, { wishlist: 'hi' })).status).toBe(404);
    vi.setSystemTime(new Date('2027-02-01T00:00:00Z'));
    expect((await run(tokens.Ann, { wishlist: 'hi' })).status).toBe(404);
    expect((await reveal({ env, params: { token: tokens.Ann }, request: req('GET', '/api/s/x') })).status).toBe(404);
  });
});
