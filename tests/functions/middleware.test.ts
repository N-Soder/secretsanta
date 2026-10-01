import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../functions/api/_middleware';
import type { Context } from '../../functions/_shared/env';

afterEach(() => vi.restoreAllMocks());

const run = (path: string, method: string, next: () => Promise<Response>) =>
  onRequest({ request: new Request(`https://secretsanta.test${path}`, { method }), next } as unknown as Context & { next(): Promise<Response> });

describe('API middleware', () => {
  it('answers unknown API paths with JSON 404 instead of the app shell', async () => {
    const next = vi.fn();
    for (const path of ['/api/unknown', '/api/send-links', '/api/s', '/api/manage/a/b/c']) {
      const response = await run(path, 'GET', next);
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toContain('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'notFound' });
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods with JSON 405', async () => {
    const next = vi.fn();
    for (const [path, method] of [['/api/groups', 'GET'], ['/api/s/abc', 'DELETE'], ['/api/recover', 'PUT'], ['/api/manage/abc/export', 'POST']]) {
      const response = await run(path, method, next);
      expect(response.status).toBe(405);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'methodNotAllowed' });
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('adds no-store and no-referrer to handler responses', async () => {
    const response = await run('/api/s/abc', 'GET', async () => new Response('{}', { headers: { 'Cache-Control': 'max-age=60' } }));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('turns uncaught failures into a generic error without private detail', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await run('/api/manage/abc', 'GET', async () => { throw new Error('secret token a@example.com'); });
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'unavailable' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('a@example.com');
  });
});
