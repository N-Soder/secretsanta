// Cloudflare Pages Function: POST /api/send-links
//
// Emails each giver their private link through Resend. Stateless: nothing is
// stored or logged here. Needs RESEND_API_KEY (secret) and EMAIL_FROM, e.g.
// "Secret Santa <santa@soderholm.app>", set in the Pages project.

import { renderLinkEmail, validateSendLinksRequest } from '../_shared/linkEmails';

export interface Env {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

interface Context {
  request: Request;
  env: Env;
}

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return json({ error: 'Email sending isn’t set up on this site.' }, 503);
  }

  // Only accept requests from our own pages. Not a security boundary on its own
  // (curl can fake it), but it stops other sites posting from a browser.
  const siteOrigin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== siteOrigin) {
    return json({ error: 'Forbidden.' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const validation = validateSendLinksRequest(body, siteOrigin);
  if (!validation.ok) {
    return json({ error: validation.error }, 400);
  }

  const { organiserName, messages } = validation.request;
  const emails = messages.map(message => ({
    from: env.EMAIL_FROM,
    to: [message.to],
    ...renderLinkEmail(message, organiserName),
  }));

  const response = await fetch(RESEND_BATCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emails),
  });

  if (!response.ok) {
    // Log the status only; the response body can echo addresses.
    console.error(`Resend batch send failed with status ${response.status}`);
    const status = response.status === 429 ? 429 : 502;
    return json({ error: status === 429
      ? 'Too many emails sent recently. Try again later.'
      : 'The email service rejected the request.' }, status);
  }

  return json({ sent: emails.length });
}
