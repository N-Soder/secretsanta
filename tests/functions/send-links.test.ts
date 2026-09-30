import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../../functions/api/send-links';

const ORIGIN = 'https://secretsanta.soderholm.app';
const ENV = { RESEND_API_KEY: 're_test', EMAIL_FROM: 'Secret Santa <santa@soderholm.app>' };
const BODY = {
  organiserName: 'Nick',
  messages: [
    { to: 'alice@example.com', giverName: 'Alice', link: `${ORIGIN}/pairing?from=Alice&to=x` },
    { to: 'bob@example.com', giverName: 'Bob', link: `${ORIGIN}/pairing?from=Bob&to=y` },
  ],
};

function post(body: unknown, origin = ORIGIN) {
  return new Request(`${ORIGIN}/api/send-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/send-links', () => {
  it('sends one email per giver in a single Resend batch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestPost({ request: post(BODY), env: ENV });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 2 });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails/batch');
    expect(init.headers.Authorization).toBe('Bearer re_test');

    const emails = JSON.parse(init.body);
    expect(emails).toHaveLength(2);
    expect(emails[0]).toMatchObject({ from: ENV.EMAIL_FROM, to: ['alice@example.com'], subject: 'Your Secret Santa link' });
    expect(emails[1].text).toContain(BODY.messages[1].link);
  });

  it('returns 503 when email isn’t configured', async () => {
    const response = await onRequestPost({ request: post(BODY), env: {} });
    expect(response.status).toBe(503);
  });

  it('rejects requests from other origins', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestPost({ request: post(BODY, 'https://evil.example'), env: ENV });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and invalid payloads without calling Resend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await onRequestPost({ request: post('{nope'), env: ENV })).status).toBe(400);
    expect((await onRequestPost({ request: post({ messages: [] }), env: ENV })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes through Resend rate limiting as 429 and other failures as 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    expect((await onRequestPost({ request: post(BODY), env: ENV })).status).toBe(429);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 422 })));
    expect((await onRequestPost({ request: post(BODY), env: ENV })).status).toBe(502);
  });
});
