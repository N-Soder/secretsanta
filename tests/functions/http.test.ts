import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { apiError, json, readJsonBody, rejectForeignOrigin } from '../../functions/_shared/http';
import { verifyTurnstile } from '../../functions/_shared/turnstile';
import { req, stubFetch } from '../helpers/env';

afterEach(() => vi.unstubAllGlobals());

describe('http helpers', () => {
  it('rejects an oversized declared body before reading it', async () => {
    const request = new Request('https://secretsanta.test/api/x', { method: 'POST', headers: { 'Content-Length': '65537' }, body: '{}' });
    const result = await readJsonBody(request);
    expect(!result.ok && result.response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it('cancels an oversized undeclared stream without reading all later chunks', async () => {
    let cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; } });
    const request = new Request('https://secretsanta.test/api/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    const result = await readJsonBody(request);
    expect(!result.ok && result.response.status).toBe(413);
    expect(cancelled).toBe(true);
  });
  it('never lets responses be cached', () => {
    expect(json({}).headers.get('Cache-Control')).toBe('no-store');
    expect(apiError('notFound', 404).headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects missing and foreign origins', async () => {
    expect(rejectForeignOrigin(req('POST', '/api/x', {}))).toBeNull();
    expect(rejectForeignOrigin(req('POST', '/api/x', {}, null))?.status).toBe(403);
    expect(rejectForeignOrigin(req('POST', '/api/x', {}, 'https://evil.test'))?.status).toBe(403);
  });

  it('reads JSON and refuses oversized or malformed bodies', async () => {
    expect(await readJsonBody(req('POST', '/x', { a: 1 }))).toEqual({ ok: true, body: { a: 1 } });
    const bad = await readJsonBody(req('POST', '/x', '{nope'));
    expect(bad.ok === false && bad.response.status).toBe(400);
    const big = await readJsonBody(req('POST', '/x', JSON.stringify({ a: 'x'.repeat(70_000) })));
    expect(big.ok === false && big.response.status).toBe(413);
  });
});

describe('verifyTurnstile', () => {
  it('passes only when Cloudflare says so', async () => {
    const fetchStub = stubFetch();
    expect(await verifyTurnstile('secret', 'token', '1.2.3.4')).toBe(true);
    fetchStub.turnstileOk(false);
    expect(await verifyTurnstile('secret', 'token', null)).toBe(false);
  });
  it('fails closed without a secret or token', async () => {
    expect(await verifyTurnstile(undefined, 'token', null)).toBe(false);
    expect(await verifyTurnstile('secret', '', null)).toBe(false);
    expect(await verifyTurnstile('secret', 42, null)).toBe(false);
  });
});
