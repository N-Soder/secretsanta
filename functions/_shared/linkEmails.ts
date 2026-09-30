// Validation and templates for emailing private links. Kept free of Cloudflare
// types so it can be unit-tested with Vitest.

export const MAX_RECIPIENTS = 50;
const MAX_NAME_LENGTH = 80;
const MAX_LINK_LENGTH = 4000;
// Deliberately loose: Resend does the real validation, this just rejects obvious junk.
const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export interface LinkEmail {
  to: string;
  giverName: string;
  link: string;
}

export interface SendLinksRequest {
  organiserName?: string;
  messages: LinkEmail[];
}

export type ValidationResult =
  | { ok: true; request: SendLinksRequest }
  | { ok: false; error: string };

function isShortText(value: unknown, maxLength = MAX_NAME_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

// Only links to this site's reveal page are accepted, so the endpoint can't be
// used to email arbitrary URLs.
export function isPairingLink(link: unknown, siteOrigin: string): link is string {
  if (typeof link !== 'string' || link.length > MAX_LINK_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }

  return url.origin === siteOrigin
    && url.pathname === '/pairing'
    && url.searchParams.has('from')
    && url.searchParams.has('to');
}

export function validateSendLinksRequest(body: unknown, siteOrigin: string): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const { organiserName, messages } = body as Record<string, unknown>;

  if (organiserName !== undefined && organiserName !== '' && !isShortText(organiserName)) {
    return { ok: false, error: 'Organiser name is too long.' };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'No emails to send.' };
  }

  if (messages.length > MAX_RECIPIENTS) {
    return { ok: false, error: `At most ${MAX_RECIPIENTS} emails can be sent at once.` };
  }

  const validated: LinkEmail[] = [];
  for (const [index, message] of messages.entries()) {
    const { to, giverName, link } = (message ?? {}) as Record<string, unknown>;
    const position = `Email ${index + 1}`;

    if (typeof to !== 'string' || to.length > 254 || !EMAIL_PATTERN.test(to.trim())) {
      return { ok: false, error: `${position}: invalid email address.` };
    }
    if (!isShortText(giverName)) {
      return { ok: false, error: `${position}: missing or overly long name.` };
    }
    if (!isPairingLink(link, siteOrigin)) {
      return { ok: false, error: `${position}: not a link to this site.` };
    }

    validated.push({ to: to.trim(), giverName: giverName.trim(), link });
  }

  return {
    ok: true,
    request: {
      organiserName: typeof organiserName === 'string' && organiserName.trim() ? organiserName.trim() : undefined,
      messages: validated,
    },
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderLinkEmail({ giverName, link }: LinkEmail, organiserName?: string): RenderedEmail {
  const subject = 'Your Secret Santa link';
  const intro = organiserName
    ? `${organiserName} has drawn names for Secret Santa.`
    : 'Names have been drawn for Secret Santa.';
  const warning = 'Open it yourself and don’t forward this email — the link reveals who you’re buying for.';

  const text = [
    `Hi ${giverName},`,
    '',
    intro,
    'Open your private link to see who you’re buying for:',
    '',
    link,
    '',
    warning,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en-AU">
<body style="margin:0;padding:24px;background:#F7F2E8;font-family:Helvetica,Arial,sans-serif;color:#1F2A27;">
  <div style="max-width:480px;margin:0 auto;background:#FFFDF8;border:1px solid #E6DFCF;border-radius:16px;padding:28px;">
    <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(giverName)},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${escapeHtml(intro)} Open your private link to see who you’re buying for.</p>
    <p style="margin:24px 0;text-align:center;">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#153B35;color:#F7F2E8;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px;">Reveal my person</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#6B6A60;">${escapeHtml(warning)}</p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
