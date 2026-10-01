import type { ApiError, ApiErrorCode, ConfigResponse, CreateGroupRequest, CreateGroupResponse, ExportFormat, ManageView, PatchRequest, RedrawRequest, RevealView, SendRequest, SendResponse } from './types';

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly apiError: ApiError) {
    super('The request could not be completed.');
    this.name = 'ApiClientError';
  }
}
const errorCodes: ApiErrorCode[] = ['invalid', 'notFound', 'forbidden', 'tooLarge', 'turnstile', 'methodNotAllowed', 'unavailable', 'drawBlocked', 'needsConfirm', 'stale', 'emailDisabled', 'emailFailed'];
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function structuredError(value: unknown): ApiError {
  if (!object(value) || !errorCodes.includes(value.error as ApiErrorCode)
    || (value.field !== undefined && typeof value.field !== 'string')
    || (value.viewedCount !== undefined && (typeof value.viewedCount !== 'number' || !Number.isInteger(value.viewedCount) || value.viewedCount < 0))
    || (value.stuckGiverIds !== undefined && (!Array.isArray(value.stuckGiverIds) || !value.stuckGiverIds.every(id => typeof id === 'string')))) return { error: 'unavailable' };
  return value as unknown as ApiError;
}
async function request<T>(path: string, method: string, valid: (value: unknown) => boolean, body?: unknown, signal?: AbortSignal, empty = false): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method, cache: 'no-store', credentials: 'same-origin', signal,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new ApiClientError(0, { error: 'unavailable' });
  }
  if (response.status === 204 && empty) return undefined as T;
  let value: unknown;
  try { value = await response.json(); } catch {
    if (signal?.aborted) throw signal.reason;
    throw new ApiClientError(response.status, { error: 'unavailable' });
  }
  if (!response.ok) throw new ApiClientError(response.status, structuredError(value));
  if (!valid(value)) throw new ApiClientError(response.status, { error: 'unavailable' });
  return value as T;
}
const managePath = (token: string) => `/api/manage/${encodeURIComponent(token)}`;
const participantPath = (token: string) => `/api/s/${encodeURIComponent(token)}`;
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const settings = (value: unknown) => object(value) && typeof value.message === 'string'
  && (value.budgetAmount === null || (typeof value.budgetAmount === 'number' && Number.isInteger(value.budgetAmount)))
  && typeof value.budgetCurrency === 'string' && nullableString(value.eventDate)
  && typeof value.timezone === 'string' && typeof value.remindersEnabled === 'boolean' && nullableString(value.organiserEmail);
const logKinds = ['link', 'match_changed', 'reminder_7d', 'reminder_1d', 'recovery'];
const participant = (value: unknown) => object(value) && typeof value.id === 'string' && typeof value.name === 'string'
  && typeof value.hint === 'string' && nullableString(value.email) && typeof value.link === 'string'
  && typeof value.opened === 'boolean' && object(value.sent)
  && Object.entries(value.sent).every(([kind, stamp]) => logKinds.includes(kind) && typeof stamp === 'string')
  && Array.isArray(value.rules) && value.rules.every(rule => object(rule) && ['must', 'mustNot'].includes(rule.type as string)
    && typeof rule.targetParticipantId === 'string' && (rule.origin === undefined || rule.origin === 'history'));
const manage = (value: unknown) => object(value) && settings(value.settings)
  && Array.isArray(value.participants) && value.participants.every(participant)
  && Number.isInteger(value.revision) && Number.isInteger(value.drawVersion) && typeof value.emailEnabled === 'boolean'
  && typeof value.createdAt === 'string' && typeof value.expiresAt === 'string';
const reveal = (value: unknown) => object(value) && object(value.receiver) && typeof value.receiver.name === 'string'
  && typeof value.receiver.hint === 'string' && typeof value.receiver.wishlist === 'string'
  && typeof value.giverName === 'string' && typeof value.ownWishlist === 'string' && typeof value.message === 'string'
  && typeof value.expiresAt === 'string' && typeof value.budgetCurrency === 'string'
  && (value.budgetAmount === null || typeof value.budgetAmount === 'number') && (value.eventDate === null || typeof value.eventDate === 'string');

// Reads are cancellable. Mutations are never automatically retried; a lost
// response does not establish whether the server applied the change.
export const api = {
  config: (signal?: AbortSignal) => request<ConfigResponse>('/api/config', 'GET', value => object(value) && typeof value.emailEnabled === 'boolean' && typeof value.turnstileSiteKey === 'string', undefined, signal),
  create: (body: CreateGroupRequest) => request<CreateGroupResponse>('/api/groups', 'POST', value => object(value) && typeof value.manageToken === 'string' && Array.isArray(value.participants) && value.participants.every(person => object(person) && typeof person.id === 'string' && typeof person.link === 'string'), body),
  manage: (token: string, signal?: AbortSignal) => request<ManageView>(managePath(token), 'GET', manage, undefined, signal),
  patch: (token: string, body: PatchRequest) => request<ManageView>(managePath(token), 'PATCH', manage, body),
  redraw: (token: string, body: RedrawRequest) => request<ManageView>(`${managePath(token)}/redraw`, 'POST', manage, body),
  send: (token: string, body: SendRequest) => request<SendResponse>(`${managePath(token)}/send`, 'POST', value => object(value) && Array.isArray(value.results) && value.results.every(result => object(result) && typeof result.participantId === 'string' && typeof result.ok === 'boolean'), body),
  reveal: (token: string, signal?: AbortSignal) => request<RevealView>(participantPath(token), 'GET', reveal, undefined, signal),
  wishlist: (token: string, wishlist: string) => request<{ wishlist: string } | undefined>(`${participantPath(token)}/wishlist`, 'PUT', value => object(value) && typeof value.wishlist === 'string', { wishlist }, undefined, true),
  delete: (token: string) => request<void>(managePath(token), 'DELETE', () => false, undefined, undefined, true),
  recover: (email: string, turnstileToken: string) => request<{ accepted: true }>('/api/recover', 'POST', value => object(value) && value.accepted === true, { email, turnstileToken }),
};
export function exportUrl(token: string, format: ExportFormat): string {
  if (!['history', 'links', 'json'].includes(format)) throw new Error('Unsupported export format');
  return `${managePath(token)}/export?format=${format}`;
}
