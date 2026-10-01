import { describe, expect, it } from 'vitest';
import {
  buildManageView, buildRevealView, countViewed, deleteGroup, findGroupByManageToken, findParticipantByToken, markViewed, saveWishlist,
} from '../../functions/_shared/repo';
import { makeEnv, ORIGIN } from '../helpers/env';
import { NOW, seedGroup } from '../helpers/fixtures';

describe('repo: create and read', () => {
  it('finds a group by its manage token and never stores the token itself', async () => {
    const env = makeEnv();
    const { manageToken, group } = await seedGroup(env);
    expect(group.expires_at).toBe('2027-02-01T00:00:00.000Z');
    expect(group.site_origin).toBe(ORIGIN);
    const dump = JSON.stringify(env.DB.raw.prepare('SELECT * FROM groups').all());
    expect(dump).not.toContain(manageToken);
    expect(await findGroupByManageToken(env.DB, 'x'.repeat(22), NOW)).toBeNull();
  });

  it('stops finding groups once they have expired', async () => {
    const env = makeEnv();
    const { manageToken, tokens } = await seedGroup(env);
    const later = new Date('2027-02-01T00:00:00Z');
    expect(await findGroupByManageToken(env.DB, manageToken, later)).toBeNull();
    expect(await findParticipantByToken(env.DB, tokens.Ann, later)).toBeNull();
  });

  it('builds the organiser view with links and without pairings or wishlists', async () => {
    const env = makeEnv();
    const { group, tokens } = await seedGroup(env);
    await saveWishlist(env.DB, (await findParticipantByToken(env.DB, tokens.Ann, NOW))!.participant.id, 'secret wish');
    const view = await buildManageView(env.DB, group, env.LINK_KEY, true);
    expect(view.participants.map(p => p.name)).toEqual(['Ann', 'Bob', 'Cat']);
    expect(view.participants[0].link).toBe(`${ORIGIN}/s/${tokens.Ann}`);
    expect(view.participants[0].email).toBe('ann@example.com');
    expect(view.settings.budgetAmount).toBe(3000);
    const text = JSON.stringify(view);
    expect(text).not.toContain('secret wish');
    expect(text).not.toMatch(/receiver|pairing/i);
  });

  it('builds the reveal view for a participant', async () => {
    const env = makeEnv();
    const { tokens } = await seedGroup(env);
    const bob = (await findParticipantByToken(env.DB, tokens.Bob, NOW))!;
    await saveWishlist(env.DB, bob.participant.id, 'socks');
    const ann = (await findParticipantByToken(env.DB, tokens.Ann, NOW))!;
    expect(await buildRevealView(env.DB, ann.participant, ann.group)).toEqual({
      giverName: 'Ann',
      receiver: { name: 'Bob', hint: '', wishlist: 'socks' },
      ownWishlist: '',
      message: 'Bring a card', budgetAmount: 3000, budgetCurrency: 'AUD', eventDate: '2026-12-20',
      expiresAt: '2027-02-01T00:00:00.000Z',
    });
  });

  it('records the first view only once', async () => {
    const env = makeEnv();
    const { group, tokens } = await seedGroup(env);
    const ann = (await findParticipantByToken(env.DB, tokens.Ann, NOW))!;
    await markViewed(env.DB, ann.participant.id, NOW);
    await markViewed(env.DB, ann.participant.id, new Date('2026-11-01T00:00:00Z'));
    expect((await findParticipantByToken(env.DB, tokens.Ann, NOW))!.participant.first_viewed_at).toBe(NOW.toISOString());
    expect(await countViewed(env.DB, group.id)).toBe(1);
  });

  it('deletes a group and everything in it', async () => {
    const env = makeEnv();
    const { group, tokens } = await seedGroup(env);
    await deleteGroup(env.DB, group.id);
    expect(await findParticipantByToken(env.DB, tokens.Ann, NOW)).toBeNull();
    expect(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM participants').all()).toEqual([{ n: 0 }]);
  });
});
