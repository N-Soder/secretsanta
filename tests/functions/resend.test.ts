import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '../../functions/_shared/resend';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Resend transport', () => {
  it('retries a brief rate limit with identical payload and key', async () => {
    vi.useFakeTimers();
    const network = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '1' } })).mockResolvedValueOnce(Response.json({ data: [{ id: 'accepted' }] }));
    vi.stubGlobal('fetch', network);
    const promise = sendEmail('fake-key', 'operation-id', '[{"to":["test@example.com"]}]');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await promise).toBe(true);
    expect(network.mock.calls[0][1].body).toEqual(network.mock.calls[1][1].body);
    expect(network.mock.calls[0][1].headers['Idempotency-Key']).toBe('secret-santa/operation-id');
    expect(network.mock.calls[1][1].headers).toEqual(network.mock.calls[0][1].headers);
  });
  it('treats network, provider and malformed acceptance replies as retryable failures', async () => {
    for (const response of [new Response('{}', { status: 503 }), Response.json({ data: [] }), Response.json({ data: [{ id: null }] }), new Response('bad-json')]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      expect(await sendEmail('fake-key', 'operation-id', '[]')).toBe(false);
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await sendEmail('fake-key', 'operation-id', '[]')).toBe(false);
  });
});
