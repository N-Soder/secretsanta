import type { RenderedEmail } from './emailFormat';
export interface EmailPayload extends RenderedEmail { from: string; to: string[]; }

// A one-recipient batch keeps each retry independent and its exact payload stable.
// Never return or log provider bodies; malformed success replies are ambiguous.
export async function sendEmail(apiKey: string, operationId: string, payload: string): Promise<boolean> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `secret-santa/${operationId}` },
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get('Retry-After') ?? '1');
        // Honour brief rate-limit backoff; longer outages return a retryable
        // failure instead of holding the organiser's request indefinitely.
        if (!Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter > 3) return false;
        await new Promise(resolve => setTimeout(resolve, Math.max(500, retryAfter * 1000)));
        continue;
      }
      if (!response.ok) return false;
      const body = await response.json() as { data?: { id?: unknown }[] };
      return Array.isArray(body.data) && body.data.length === 1 && typeof body.data[0]?.id === 'string' && body.data[0].id.length > 0;
    }
    return false;
  } catch { return false; }
}
