import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClientError, exportUrl } from './client';

afterEach(() => vi.unstubAllGlobals());
const config = { emailEnabled: false, turnstileSiteKey: 'test-key' };
function respond(body: unknown, status = 200) {
  return vi.stubGlobal('fetch', vi.fn(async () => Response.json(body, { status })));
}

describe('typed API client', () => {
  it('reads configuration without cache and forwards cancellation', async () => {
    respond(config); const signal = new AbortController().signal;
    expect(await api.config(signal)).toEqual(config);
    expect(fetch).toHaveBeenCalledWith('/api/config', expect.objectContaining({ method: 'GET', cache: 'no-store', signal, credentials: 'same-origin' }));
  });
  it('routes authenticated reads and edits with validated responses', async () => {
    const view = {
      settings: { message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, timezone: 'UTC', remindersEnabled: false, organiserEmail: null },
      revision: 3, drawVersion: 1, emailEnabled: false, createdAt: 'now', expiresAt: 'later', participants: [],
    };
    respond(view); const signal = new AbortController().signal;
    expect(await api.manage('a/b', signal)).toEqual(view);
    expect(fetch).toHaveBeenLastCalledWith('/api/manage/a%2Fb', expect.objectContaining({ method: 'GET', signal }));
    const patch = { revision: 3, settings: { message: 'Updated' } };
    expect(await api.patch('a/b', patch)).toEqual(view);
    expect(fetch).toHaveBeenLastCalledWith('/api/manage/a%2Fb', expect.objectContaining({ method: 'PATCH', body: JSON.stringify(patch) }));
    const redraw = { drawVersion: 1, participants: [], confirm: true };
    expect(await api.redraw('a/b', redraw)).toEqual(view);
    expect(fetch).toHaveBeenLastCalledWith('/api/manage/a%2Fb/redraw', expect.objectContaining({ method: 'POST', body: JSON.stringify(redraw) }));
    respond({ ...view, settings: {} }); await expect(api.manage('token')).rejects.toBeInstanceOf(ApiClientError);
    respond({ ...view, participants: [null] }); await expect(api.manage('token')).rejects.toBeInstanceOf(ApiClientError);
  });
  it('routes send/reveal/wishlist with their own response contracts', async () => {
    const sent = { results: [{ participantId: 'a', ok: false }] }; respond(sent);
    const send = { kind: 'link' as const, participantIds: ['a'], turnstileToken: 'fresh' };
    expect(await api.send('a/b', send)).toEqual(sent);
    expect(fetch).toHaveBeenLastCalledWith('/api/manage/a%2Fb/send', expect.objectContaining({ method: 'POST', body: JSON.stringify(send) }));
    const revealed = { giverName: 'Ann', receiver: { name: 'Bob', hint: '', wishlist: 'Tea' }, ownWishlist: '', message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, expiresAt: 'later' };
    respond(revealed); const signal = new AbortController().signal;
    expect(await api.reveal('a/b', signal)).toEqual(revealed);
    expect(fetch).toHaveBeenLastCalledWith('/api/s/a%2Fb', expect.objectContaining({ method: 'GET', signal }));
    respond({ wishlist: 'Tea' }); await api.wishlist('a/b', 'Tea');
    expect(fetch).toHaveBeenLastCalledWith('/api/s/a%2Fb/wishlist', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ wishlist: 'Tea' }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }));
  });
  it('creates groups and recovers with typed request bodies', async () => {
    const created = { manageToken: 'token', participants: [] }; respond(created, 201);
    const input = { settings: { message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, timezone: 'UTC', remindersEnabled: false, organiserEmail: null }, participants: [], turnstileToken: 'fresh' };
    expect(await api.create(input)).toEqual(created);
    expect(fetch).toHaveBeenCalledWith('/api/groups', expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }));
    respond({ accepted: true }, 202);
    expect(await api.recover('a@example.com', 'fresh')).toEqual({ accepted: true });
    expect(fetch).toHaveBeenCalledWith('/api/recover', expect.objectContaining({ body: JSON.stringify({ email: 'a@example.com', turnstileToken: 'fresh' }) }));
  });
  it('retains the saved wishlist response', async () => {
    respond({ wishlist: 'Tea' });
    expect(await api.wishlist('token', 'Tea')).toEqual({ wishlist: 'Tea' });
  });
  it('handles empty delete/wishlist responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    expect(await api.delete('a/b')).toBeUndefined();
    expect(fetch).toHaveBeenLastCalledWith('/api/manage/a%2Fb', expect.objectContaining({ method: 'DELETE' }));
    expect(await api.wishlist('token', 'Tea')).toBeUndefined();
  });
  it.each([
    [422, { error: 'drawBlocked', stuckGiverIds: ['a'] }],
    [409, { error: 'needsConfirm', viewedCount: 2 }],
    [409, { error: 'stale' }], [400, { error: 'invalid', field: 'participants' }],
  ])('preserves structured errors at %s', async (status, error) => {
    respond(error, status);
    await expect(api.manage('token')).rejects.toMatchObject({ status, apiError: error });
  });
  it.each([null, [], 'oops', {}, { emailEnabled: 'yes', turnstileSiteKey: 'key' }])('rejects malformed config %j', async body => {
    respond(body);
    await expect(api.config()).rejects.toBeInstanceOf(ApiClientError);
  });
  it('rejects HTML, malformed errors and unexpected empty success without exposing response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<private token>', { status: 502 })));
    await expect(api.manage('token')).rejects.toMatchObject({ status: 502, apiError: { error: 'unavailable' } });
    respond({ error: 'unknown-secret-error' }, 500);
    await expect(api.config()).rejects.toMatchObject({ status: 500, apiError: { error: 'unavailable' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api.config()).rejects.toMatchObject({ status: 204 });
  });
  it('preserves abort errors and wraps network failures without retrying mutations', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn(async () => { throw abort; }));
    await expect(api.config()).rejects.toBe(abort);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('private details'); }));
    await expect(api.delete('token')).rejects.toMatchObject({ status: 0, apiError: { error: 'unavailable' } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('generates only supported export URLs locally', () => {
    expect(exportUrl('a/b', 'history')).toBe('/api/manage/a%2Fb/export?format=history');
    expect(() => exportUrl('token', 'bad' as 'json')).toThrow();
  });
});
