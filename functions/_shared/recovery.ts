import type { Env } from './env';
import { findRecoveryGroups, prepareEmail } from './emailRepo';
import { hashToken, newToken, MANAGE_TOKEN_LENGTH, sealToken } from './tokens';
import { manageLink } from './repo';
import { renderRecoveryEmail } from './emails';
import { deliverOperation } from './sending';
import type { EmailPayload } from './resend';

export async function recoverGroups(env: Env, email: string): Promise<void> {
  for (const group of await findRecoveryGroups(env.DB, email, new Date())) {
    const token = newToken(MANAGE_TOKEN_LENGTH);
    const payload: EmailPayload = { from: env.EMAIL_FROM!, to: [group.organiser_email!], ...renderRecoveryEmail(manageLink(group.site_origin, token)) };
    const operation = await prepareEmail(env.DB, group, {
      participantId: null, kind: 'recovery', explicit: false,
      slot: `recovery:${group.id}:${group.manage_token_hash}`,
      sealed: await sealToken(JSON.stringify([payload]), env.LINK_KEY),
      recoveryHash: await hashToken(token),
    }, new Date());
    if (operation) await deliverOperation(env, operation);
  }
}
