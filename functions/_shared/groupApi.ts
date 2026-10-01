import type { Context } from './env';
import { emailEnabled } from './env';
import { apiError, json, readJsonBody, rejectForeignOrigin, siteOrigin } from './http';
import { drawPairs } from './draw';
import { isPlainObject, validateParticipantPatches, validateParticipants, validateSettings, validateSettingsPatch } from './validate';
import { isTokenShape, MANAGE_TOKEN_LENGTH } from './tokens';
import { applyPatch, buildManageView, countViewed, createGroup, deleteGroup, findGroupByManageToken, MutationConflict, replaceDraw } from './repo';
import type { GroupRow } from './repo';
import { verifyTurnstile } from './turnstile';
import type { PatchRequest } from '../../src/api/types';

export async function manageGroup(ctx: Context<'token'>): Promise<GroupRow | Response> {
  if (!isTokenShape(ctx.params.token, MANAGE_TOKEN_LENGTH)) return apiError('notFound', 404);
  return await findGroupByManageToken(ctx.env.DB, ctx.params.token, new Date()) ?? apiError('notFound', 404);
}

async function writeBody(ctx: Context<string>): Promise<unknown> {
  const forbidden = rejectForeignOrigin(ctx.request);
  if (forbidden) return forbidden;
  const result = await readJsonBody(ctx.request);
  return result.ok ? result.body : result.response;
}

export async function create(ctx: Context): Promise<Response> {
  const body = await writeBody(ctx);
  if (body instanceof Response) return body;
  if (!isPlainObject(body)) return apiError('invalid', 400, { field: 'body' });
  const settings = validateSettings(body.settings);
  if (!settings.ok) return apiError('invalid', 400, { field: settings.field });
  const people = validateParticipants(body.participants);
  if (!people.ok) return apiError('invalid', 400, { field: people.field });
  if (settings.value.remindersEnabled && !people.value.some(person => person.email)) return apiError('invalid', 400, { field: 'settings.remindersEnabled' });
  if (!await verifyTurnstile(ctx.env.TURNSTILE_SECRET_KEY, body.turnstileToken, ctx.request.headers.get('CF-Connecting-IP'))) return apiError('turnstile', 403);
  const draw = drawPairs(people.value);
  if (!draw.ok) return apiError('drawBlocked', 422, { stuckGiverIds: draw.stuckGiverIds });
  const created = await createGroup(ctx.env.DB, { settings: settings.value, participants: people.value, pairs: draw.pairs, linkKey: ctx.env.LINK_KEY, origin: siteOrigin(ctx.request), now: new Date() });
  const group = (await findGroupByManageToken(ctx.env.DB, created.manageToken, new Date()))!;
  const view = await buildManageView(ctx.env.DB, group, ctx.env.LINK_KEY, emailEnabled(ctx.env));
  return json({ manageToken: created.manageToken, participants: view.participants.map(({ id, link }) => ({ id, link })) }, 201);
}

export async function getManage(ctx: Context<'token'>): Promise<Response> {
  const group = await manageGroup(ctx);
  return group instanceof Response ? group : json(await buildManageView(ctx.env.DB, group, ctx.env.LINK_KEY, emailEnabled(ctx.env)));
}

export async function patchManage(ctx: Context<'token'>): Promise<Response> {
  const body = await writeBody(ctx);
  if (body instanceof Response) return body;
  if (!isPlainObject(body)) return apiError('invalid', 400, { field: 'body' });
  const group = await manageGroup(ctx);
  if (group instanceof Response) return group;
  if (!Number.isInteger(body.revision) || (body.revision as number) < 1) return apiError('invalid', 400, { field: 'revision' });
  if (body.revision !== group.revision) return apiError('stale', 409);
  if (Object.keys(body).some(key => !['settings', 'participants', 'revision'].includes(key))) return apiError('invalid', 400, { field: 'body' });
  const patch: PatchRequest = {};
  if ('settings' in body) {
    const result = validateSettingsPatch(body.settings);
    if (!result.ok) return apiError('invalid', 400, { field: result.field });
    patch.settings = result.value;
  }
  if ('participants' in body) {
    const result = validateParticipantPatches(body.participants);
    if (!result.ok) return apiError('invalid', 400, { field: result.field });
    patch.participants = result.value;
  }
  try {
    const result = await applyPatch(ctx.env.DB, group, patch);
    if (!result.ok) return apiError('invalid', 400, { field: result.field });
  } catch (error) {
    if (error instanceof MutationConflict) return apiError(error.reason, 409);
    throw error;
  }
  return getManage(ctx);
}

export async function redraw(ctx: Context<'token'>): Promise<Response> {
  const body = await writeBody(ctx);
  if (body instanceof Response) return body;
  if (!isPlainObject(body)) return apiError('invalid', 400, { field: 'body' });
  const group = await manageGroup(ctx);
  if (group instanceof Response) return group;
  if (!Number.isInteger(body.drawVersion) || (body.drawVersion as number) < 1) return apiError('invalid', 400, { field: 'drawVersion' });
  if (typeof body.confirm !== 'boolean') return apiError('invalid', 400, { field: 'confirm' });
  if (body.drawVersion !== group.draw_version) return apiError('stale', 409);
  const people = validateParticipants(body.participants);
  if (!people.ok) return apiError('invalid', 400, { field: people.field });
  if (group.reminders_enabled && !people.value.some(person => person.email)) return apiError('invalid', 400, { field: 'settings.remindersEnabled' });
  const draw = drawPairs(people.value);
  if (!draw.ok) return apiError('drawBlocked', 422, { stuckGiverIds: draw.stuckGiverIds });
  try {
    await replaceDraw(ctx.env.DB, group, people.value, draw.pairs, ctx.env.LINK_KEY, body.confirm);
  } catch (error) {
    if (error instanceof MutationConflict) return apiError(error.reason, 409, error.reason === 'needsConfirm' ? { viewedCount: await countViewed(ctx.env.DB, group.id) } : {});
    throw error;
  }
  return getManage(ctx);
}

export async function remove(ctx: Context<'token'>): Promise<Response> {
  const forbidden = rejectForeignOrigin(ctx.request);
  if (forbidden) return forbidden;
  const group = await manageGroup(ctx);
  if (group instanceof Response) return group;
  await deleteGroup(ctx.env.DB, group.id);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
