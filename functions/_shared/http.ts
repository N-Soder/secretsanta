import { LIMITS } from '../../src/api/limits';
import type { ApiError, ApiErrorCode } from '../../src/api/types';

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers },
  });
}

export function apiError(error: ApiErrorCode, status: number, extra: Omit<ApiError, 'error'> = {}): Response {
  return json({ error, ...extra }, status);
}

export const siteOrigin = (request: Request) => new URL(request.url).origin;

// Browsers always send Origin on non-GET requests. Not a security boundary on its own
// (curl can fake it), but it stops other sites driving the API from a visitor's browser.
export function rejectForeignOrigin(request: Request): Response | null {
  return request.headers.get('Origin') === siteOrigin(request) ? null : apiError('forbidden', 403);
}

export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const tooLarge = () => ({ ok: false as const, response: apiError('tooLarge', 413) });
  if (Number(request.headers.get('Content-Length')) > LIMITS.bodyBytes) return tooLarge();
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > LIMITS.bodyBytes) {
          await reader.cancel();
          return tooLarge();
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, response: apiError('invalid', 400, { field: 'body' }) };
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: apiError('invalid', 400, { field: 'body' }) };
  }
}
