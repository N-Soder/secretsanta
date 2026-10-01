import type { Context } from './env';
import { emailEnabled } from './env';
import { apiError, json, readJsonBody, rejectForeignOrigin } from './http';
import { isPlainObject } from './validate';
import { manageGroup } from './groupApi';
import { loadParticipants } from './repo';
import { verifyTurnstile } from './turnstile';
import { sendToParticipants } from './sending';
import { recoverGroups } from './recovery';
import { EMAIL_PATTERN } from '../../src/api/limits';

async function bodyFor(ctx: Context<string>): Promise<unknown> {
  const forbidden = rejectForeignOrigin(ctx.request);
  if (forbidden) return forbidden;
  const result = await readJsonBody(ctx.request);
  if (!result.ok) return result.response;
  if (!emailEnabled(ctx.env)) return apiError('emailDisabled', 503);
  return result.body;
}

export async function send(ctx: Context<'token'>): Promise<Response> {
  const body = await bodyFor(ctx);
  if (body instanceof Response) return body;
  if (!isPlainObject(body) || Object.keys(body).some(key => !['kind','participantIds','turnstileToken'].includes(key))) return apiError('invalid', 400, { field: 'body' });
  if (body.kind !== 'link' && body.kind !== 'match_changed') return apiError('invalid', 400, { field: 'kind' });
  const group = await manageGroup(ctx);
  if (group instanceof Response) return group;
  let ids: string[] | undefined;
  if ('participantIds' in body) {
    const value = body.participantIds;
    if (!Array.isArray(value) || value.length === 0 || value.length > 100 || value.some(id => typeof id !== 'string') || new Set(value).size !== value.length) return apiError('invalid', 400, { field: 'participantIds' });
    ids = value as string[];
    const people = new Set((await loadParticipants(ctx.env.DB, group.id)).map(person => person.id));
    if (ids.some(id => !people.has(id))) return apiError('invalid', 400, { field: 'participantIds' });
  }
  if (!await verifyTurnstile(ctx.env.TURNSTILE_SECRET_KEY, body.turnstileToken, ctx.request.headers.get('CF-Connecting-IP'))) return apiError('turnstile', 403);
  return json({ results: await sendToParticipants(ctx.env, group, body.kind, ids) });
}

export async function recover(ctx: Context): Promise<Response> {
  const body = await bodyFor(ctx);
  if (body instanceof Response) return body;
  if (!isPlainObject(body) || Object.keys(body).some(key => !['email','turnstileToken'].includes(key)) || typeof body.email !== 'string' || body.email.trim().length > 254 || !EMAIL_PATTERN.test(body.email.trim())) return apiError('invalid', 400, { field: 'email' });
  if (!await verifyTurnstile(ctx.env.TURNSTILE_SECRET_KEY, body.turnstileToken, ctx.request.headers.get('CF-Connecting-IP'))) return apiError('turnstile', 403);
  // The public response must not reveal lookup or delivery outcomes, including
  // through its timing, so delivery continues after the reply where possible.
  const work = recoverGroups(ctx.env, body.email.trim()).catch(() => {
    console.error('Secret Santa recovery operation could not complete');
  });
  if (ctx.waitUntil) ctx.waitUntil(work); else await work;
  return json({ accepted: true }, 202);
}
