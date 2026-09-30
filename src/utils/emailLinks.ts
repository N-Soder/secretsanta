export interface LinkEmailRequest {
  organiserName?: string;
  messages: { to: string; giverName: string; link: string }[];
}

export type SendLinkEmailsResult =
  | { ok: true; sent: number }
  | { ok: false; error?: string };

export async function sendLinkEmails(request: LinkEmailRequest): Promise<SendLinkEmailsResult> {
  let response: Response;
  try {
    response = await fetch('/api/send-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false };
  }

  const body = await response.json().catch(() => ({}));
  return response.ok
    ? { ok: true, sent: body.sent ?? request.messages.length }
    : { ok: false, error: typeof body.error === 'string' ? body.error : undefined };
}
