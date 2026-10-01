import type { Env } from './env';
import type { LogKind, SendResult } from '../../src/api/types';
import { loadParticipants, participantLink, type GroupRow } from './repo';
import { claimEmails, finishEmails, prepareEmails, type EmailOperation } from './emailRepo';
import { openToken, sealToken } from './tokens';
import { renderParticipantEmail } from './emails';
import { sendEmail, type EmailPayload } from './resend';

export async function deliverOperations(env: Env, operations: EmailOperation[]): Promise<Set<string>> {
  const successes = new Set(operations.filter(operation => operation.state === 'sent').map(operation => operation.id));
  const claimed = await claimEmails(env.DB, operations.filter(operation => operation.state !== 'sent').map(operation => operation.id), new Date());
  const outcomes: { operation: EmailOperation; ok: boolean }[] = [];
  // Leases are short, so concurrent calls can resume interrupted delivery. Each
  // network attempt uses the stored payload/key even if a lease is reclaimed.
  for (const operation of claimed) {
    const payload = await openToken(operation.payload_sealed!, env.LINK_KEY);
    outcomes.push({ operation, ok: await sendEmail(env.RESEND_API_KEY!, operation.id, payload) });
  }
  for (const id of await finishEmails(env.DB, outcomes, new Date())) successes.add(id);
  return successes;
}

export async function deliverOperation(env: Env, operation: EmailOperation): Promise<boolean> {
  return (await deliverOperations(env, [operation])).has(operation.id);
}

export async function sendToParticipants(env: Env, group: GroupRow, kind: Exclude<LogKind, 'recovery'>, participantIds?: string[]): Promise<SendResult[]> {
  const people = await loadParticipants(env.DB, group.id);
  const { results: logs } = await env.DB.prepare('SELECT participant_id FROM send_log WHERE group_id=? AND kind=? AND draw_version=?')
    .bind(group.id, kind, group.draw_version).all<{ participant_id: string }>();
  const sent = new Set(logs.map(log => log.participant_id));
  const explicit = participantIds !== undefined;
  const selected = people.filter(person => person.email && (explicit ? participantIds.includes(person.id) : !sent.has(person.id)));
  // Targeted retries reuse unresolved default operations. A new key could
  // duplicate provider acceptance whose reply was lost. Successful resends get
  // a fresh identity; uncertain operations require reconciliation after 23h.
  const { results: pending } = await env.DB.prepare(`SELECT * FROM email_operations WHERE group_id=? AND kind=? AND draw_version=? AND state<>'sent' ORDER BY explicit DESC`)
    .bind(group.id, kind, group.draw_version).all<EmailOperation>();
  const byPerson = new Map(pending.map(operation => [operation.participant_id, operation]));
  const inputs = await Promise.all(selected.filter(person => !byPerson.has(person.id)).map(async person => {
    const link = participantLink(group.site_origin, await openToken(person.link_token_sealed, env.LINK_KEY));
    const payload: EmailPayload = { from: env.EMAIL_FROM!, to: [person.email!], ...renderParticipantEmail(kind, group, person, link) };
    return {
      participantId: person.id, kind, explicit,
      slot: `${explicit ? 'explicit' : 'default'}:${group.id}:${person.id}:${kind}:${group.draw_version}`,
      sealed: await sealToken(JSON.stringify([payload]), env.LINK_KEY),
    };
  }));
  for (const operation of await prepareEmails(env.DB, group, inputs, new Date())) byPerson.set(operation.participant_id, operation);
  const operations = selected.flatMap(person => byPerson.has(person.id) ? [byPerson.get(person.id)!] : []);
  const successes = await deliverOperations(env, operations);
  return selected.map(person => ({ participantId: person.id, ok: successes.has(byPerson.get(person.id)?.id ?? '') }));
}
