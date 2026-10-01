import { vi } from 'vitest';
import type { Env } from '../../functions/_shared/env';
import { createTestDb, TestDb } from './d1';

export const ORIGIN = 'https://secretsanta.test';
export const TEST_LINK_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export function makeEnv(overrides: Partial<Env> = {}): Env & { DB: TestDb } {
  return {
    DB: createTestDb(),
    LINK_KEY: TEST_LINK_KEY,
    TURNSTILE_SECRET_KEY: 'test-secret',
    TURNSTILE_SITE_KEY: 'test-site',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Secret Santa <santa@updates.soderholm.app>',
    ...overrides,
  } as Env & { DB: TestDb };
}

// Routes fetch() to fake Turnstile and Resend endpoints. Call vi.unstubAllGlobals() in afterEach.
export function stubFetch() {
  const state = { resendCalls: [] as unknown[][], resendStatus: 200, turnstile: true };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.startsWith('https://challenges.cloudflare.com/')) {
      return new Response(JSON.stringify({ success: state.turnstile }), { status: 200 });
    }
    if (url === 'https://api.resend.com/emails/batch') {
      const batch = JSON.parse(init.body as string) as unknown[];
      if (state.resendStatus !== 200) return new Response('{}', { status: state.resendStatus });
      state.resendCalls.push(batch);
      return new Response(JSON.stringify({ data: batch.map((_, i) => ({ id: `e${i}` })) }), { status: 200 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  }));
  return {
    resendCalls: state.resendCalls,
    failResend: (status: number) => { state.resendStatus = status; },
    turnstileOk: (ok: boolean) => { state.turnstile = ok; },
  };
}

export function req(method: string, path: string, body?: unknown, origin: string | null = ORIGIN): Request {
  const headers: Record<string, string> = {};
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
