import type { Env } from './env';
import { findRecoveryGroups, isQuarantined, prepareEmail, supersedeEmails, type EmailOperation } from './emailRepo';
import { hashToken, newToken, MANAGE_TOKEN_LENGTH, sealToken } from './tokens';
import { manageLink } from './repo';
import { renderRecoveryEmail } from './emails';
import { deliverOperation } from './sending';
import type { EmailPayload } from './resend';

export async function recoverGroups(env: Env, email: string): Promise<void> {
  for (const group of await findRecoveryGroups(env.DB, email, new Date())) {
    const slot = `recovery:${group.id}:${group.manage_token_hash}`;
    // Concurrent requests share one pending replacement. One that can no longer
    // be delivered (quarantined, or addressed to a since-changed organiser email)
    // is replaced, so a single failure never blocks recovery for good.
    const existing = await env.DB.prepare('SELECT * FROM email_operations WHERE slot=?').bind(slot).first<EmailOperation>();
    if (existing && (isQuarantined(existing, new Date()) || existing.recovery_email !== group.organiser_email)) {
      await supersedeEmails(env.DB, [existing.id], new Date());
    }
    const token = newToken(MANAGE_TOKEN_LENGTH);
    const payload: EmailPayload = { from: env.EMAIL_FROM!, to: [group.organiser_email!], ...renderRecoveryEmail(manageLink(group.site_origin, token)) };
    const operation = await prepareEmail(env.DB, group, {
      participantId: null, kind: 'recovery', explicit: false,
      slot,
      sealed: await sealToken(JSON.stringify([payload]), env.LINK_KEY),
      recoveryHash: await hashToken(token),
    }, new Date());
    if (operation) await deliverOperation(env, operation);
  }
}
