import { describe, expect, it } from 'vitest';
import { MAX_RECIPIENTS, escapeHtml, isPairingLink, renderLinkEmail, validateSendLinksRequest } from '../../functions/_shared/linkEmails';

const ORIGIN = 'https://secretsanta.soderholm.app';
const LINK = `${ORIGIN}/pairing?from=Alice&to=abc%3D`;

const message = (overrides: Record<string, unknown> = {}) => ({
  to: 'alice@example.com',
  giverName: 'Alice',
  link: LINK,
  ...overrides,
});

describe('isPairingLink', () => {
  it('accepts reveal links on this site', () => {
    expect(isPairingLink(LINK, ORIGIN)).toBe(true);
  });

  it.each([
    ['another site', 'https://evil.example/pairing?from=A&to=B'],
    ['a lookalike host', 'https://secretsanta.soderholm.app.evil.example/pairing?from=A&to=B'],
    ['another path', `${ORIGIN}/?from=A&to=B`],
    ['missing params', `${ORIGIN}/pairing?from=A`],
    ['not a URL', 'pairing?from=A&to=B'],
  ])('rejects %s', (_, link) => {
    expect(isPairingLink(link, ORIGIN)).toBe(false);
  });
});

describe('validateSendLinksRequest', () => {
  it('accepts a valid request and trims fields', () => {
    const result = validateSendLinksRequest({
      organiserName: ' Nick ',
      messages: [message({ to: ' alice@example.com ', giverName: ' Alice ' })],
    }, ORIGIN);

    expect(result).toEqual({
      ok: true,
      request: {
        organiserName: 'Nick',
        messages: [{ to: 'alice@example.com', giverName: 'Alice', link: LINK }],
      },
    });
  });

  it('treats an empty organiser name as absent', () => {
    const result = validateSendLinksRequest({ organiserName: '', messages: [message()] }, ORIGIN);
    expect(result.ok && result.request.organiserName).toBeUndefined();
  });

  it.each([
    ['a non-object body', null],
    ['no messages', { messages: [] }],
    ['too many messages', { messages: Array.from({ length: MAX_RECIPIENTS + 1 }, () => message()) }],
    ['a bad address', { messages: [message({ to: 'not-an-email' })] }],
    ['an empty name', { messages: [message({ giverName: '  ' })] }],
    ['an overly long name', { messages: [message({ giverName: 'x'.repeat(81) })] }],
    ['a foreign link', { messages: [message({ link: 'https://evil.example/pairing?from=A&to=B' })] }],
    ['an overly long organiser name', { organiserName: 'x'.repeat(81), messages: [message()] }],
  ])('rejects %s', (_, body) => {
    expect(validateSendLinksRequest(body, ORIGIN).ok).toBe(false);
  });
});

describe('renderLinkEmail', () => {
  it('escapes names in the HTML body', () => {
    const { html, text } = renderLinkEmail(message({ giverName: '<b>Al</b>' }) as never, 'Tom & Jerry');

    expect(html).toContain('Hi &lt;b&gt;Al&lt;/b&gt;,');
    expect(html).toContain('Tom &amp; Jerry has drawn names');
    expect(html).not.toContain('<b>Al</b>');
    expect(text).toContain('Hi <b>Al</b>,');
  });

  it('includes the link in both parts', () => {
    const { html, text } = renderLinkEmail(message() as never);

    expect(html).toContain(`href="${escapeHtml(LINK)}"`);
    expect(text).toContain(LINK);
    expect(text).toContain('Names have been drawn');
  });
});
