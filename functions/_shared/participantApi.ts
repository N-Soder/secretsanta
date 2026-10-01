import type { Context } from './env';
import type { RevealView } from '../../src/api/types';
import { apiError, json, readJsonBody, rejectForeignOrigin } from './http';
import { isTokenShape, PARTICIPANT_TOKEN_LENGTH } from './tokens';
import { findParticipantByToken } from './repo';
import { isPlainObject, validateWishlist } from './validate';

export async function reveal(ctx: Context<'token'>): Promise<Response> {
  if (!isTokenShape(ctx.params.token, PARTICIPANT_TOKEN_LENGTH)) return apiError('notFound', 404);
  const now = new Date();
  const found = await findParticipantByToken(ctx.env.DB, ctx.params.token, now);
  if (!found) return apiError('notFound', 404);
  // Mark the opening and read its match inside one transaction, so a redraw
  // cannot interleave a view of one generation with the status of another.
  const results = await ctx.env.DB.batch([
    ctx.env.DB.prepare(`UPDATE participants SET first_viewed_at = COALESCE(first_viewed_at, ?1)
      WHERE id = ?2 AND group_id IN (SELECT id FROM groups WHERE expires_at > ?1)`)
      .bind(now.toISOString(), found.participant.id),
    ctx.env.DB.prepare(`SELECT p.name AS giverName, p.wishlist AS ownWishlist,
      r.name AS receiverName, r.hint AS receiverHint, r.wishlist AS receiverWishlist,
      g.message, g.budget_amount AS budgetAmount, g.budget_currency AS budgetCurrency,
      g.event_date AS eventDate, g.expires_at AS expiresAt
      FROM participants p JOIN groups g ON g.id = p.group_id
      JOIN pairings a ON a.giver_id = p.id JOIN participants r ON r.id = a.receiver_id
      WHERE p.id = ?1 AND g.expires_at > ?2`).bind(found.participant.id, now.toISOString()),
  ]);
  type RevealRow = Omit<RevealView, 'receiver'> & { receiverName: string; receiverHint: string; receiverWishlist: string };
  const row = (results[1] as { results: RevealRow[] }).results[0];
  if (!row) return apiError('notFound', 404);
  const { receiverName, receiverHint, receiverWishlist, ...details } = row;
  return json({ ...details, receiver: { name: receiverName, hint: receiverHint, wishlist: receiverWishlist } });
}

export async function wishlist(ctx: Context<'token'>): Promise<Response> {
  const forbidden = rejectForeignOrigin(ctx.request);
  if (forbidden) return forbidden;
  const body = await readJsonBody(ctx.request);
  if (!body.ok) return body.response;
  if (!isPlainObject(body.body)) return apiError('invalid', 400, { field: 'body' });
  const valid = validateWishlist(body.body.wishlist);
  if (!valid.ok) return apiError('invalid', 400, { field: valid.field });
  if (!isTokenShape(ctx.params.token, PARTICIPANT_TOKEN_LENGTH)) return apiError('notFound', 404);
  const now = new Date();
  const found = await findParticipantByToken(ctx.env.DB, ctx.params.token, now);
  if (!found) return apiError('notFound', 404);
  const result = await ctx.env.DB.prepare(`UPDATE participants SET wishlist = ?1 WHERE id = ?2
    AND group_id IN (SELECT id FROM groups WHERE expires_at > ?3)`)
    .bind(valid.value, found.participant.id, now.toISOString()).run();
  return result.meta.changes ? json({ wishlist: valid.value }) : apiError('notFound', 404);
}
