import type { D1Like } from './db';
import type { LogKind } from '../../src/api/types';
import type { GroupRow } from './repo';

export interface EmailOperation {
  id: string; group_id: string; participant_id: string | null; kind: LogKind;
  draw_version: number; slot: string | null; explicit: number;
  payload_sealed: string | null; state: 'pending' | 'sending' | 'sent' | 'uncertain';
  attempts: number; first_attempt_at: string | null; lease_id: string | null;
  lease_until: string | null; sent_at: string | null;
  recovery_token_hash: string | null; previous_manage_hash: string | null; recovery_email: string | null;
}
interface PreparedEmail {
  participantId: string | null; kind: LogKind; slot: string; explicit: boolean; sealed: string;
  recoveryHash?: string;
}

// json_each keeps the entire 100-person path inside D1's query budget.
// Preparation is conditional on the snapshot still being current. Only slot
// conflicts are ignored; other integrity failures must surface.
export async function prepareEmails(db: D1Like, group: GroupRow, inputs: PreparedEmail[], now: Date): Promise<EmailOperation[]> {
  if (!inputs.length) return [];
  const rows = JSON.stringify(inputs.map(input => ({ ...input, id: crypto.randomUUID() })));
  await db.prepare(`INSERT INTO email_operations
    (id,group_id,participant_id,kind,draw_version,slot,explicit,payload_sealed,recovery_token_hash,previous_manage_hash,recovery_email)
    SELECT json_extract(j.value,'$.id'),g.id,json_extract(j.value,'$.participantId'),json_extract(j.value,'$.kind'),g.draw_version,
      json_extract(j.value,'$.slot'),json_extract(j.value,'$.explicit'),json_extract(j.value,'$.sealed'),
      json_extract(j.value,'$.recoveryHash'),g.manage_token_hash,
      CASE WHEN json_extract(j.value,'$.kind')='recovery' THEN g.organiser_email ELSE NULL END
    FROM groups g,json_each(?1) j
    WHERE g.id=?2 AND g.revision=?3 AND g.manage_token_hash=?4 AND g.expires_at>?5
      AND (json_extract(j.value,'$.participantId') IS NULL OR EXISTS (
        SELECT 1 FROM participants WHERE id=json_extract(j.value,'$.participantId') AND group_id=g.id))
    ON CONFLICT(slot) DO NOTHING`).bind(rows, group.id, group.revision, group.manage_token_hash, now.toISOString()).run();
  return (await db.prepare(`SELECT * FROM email_operations WHERE group_id=?2 AND slot IN (
    SELECT json_extract(value,'$.slot') FROM json_each(?1))`).bind(rows, group.id).all<EmailOperation>()).results;
}

export async function prepareEmail(db: D1Like, group: GroupRow, input: PreparedEmail, now: Date): Promise<EmailOperation | null> {
  return (await prepareEmails(db, group, [input], now))[0] ?? null;
}

export async function claimEmails(db: D1Like, ids: string[], now: Date): Promise<EmailOperation[]> {
  if (!ids.length) return [];
  // Leave an hour of margin inside the provider's 24-hour retention window.
  const cutoff = new Date(now.getTime() - 23 * 3600_000).toISOString();
  const selected = 'id IN (SELECT value FROM json_each(?1))';
  await db.prepare(`UPDATE email_operations SET state='uncertain',lease_id=NULL,lease_until=NULL
    WHERE ${selected} AND state IN ('pending','sending') AND first_attempt_at<=?2
      AND (lease_until IS NULL OR lease_until<=?3)`).bind(JSON.stringify(ids), cutoff, now.toISOString()).run();
  const lease = crypto.randomUUID();
  await db.prepare(`UPDATE email_operations SET state='sending',lease_id=?2,lease_until=?3,
      attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?4)
    WHERE ${selected} AND state IN ('pending','sending') AND (lease_until IS NULL OR lease_until<=?4)
      AND (first_attempt_at IS NULL OR first_attempt_at>?5)
      AND EXISTS (SELECT 1 FROM groups g WHERE g.id=email_operations.group_id AND g.expires_at>?4
        AND ((kind<>'recovery' AND g.draw_version=email_operations.draw_version) OR
          (kind='recovery' AND g.manage_token_hash=previous_manage_hash AND g.organiser_email=recovery_email)))`)
    .bind(JSON.stringify(ids), lease, new Date(now.getTime() + 60_000).toISOString(), now.toISOString(), cutoff).run();
  return (await db.prepare('SELECT * FROM email_operations WHERE lease_id=?').bind(lease).all<EmailOperation>()).results;
}

export async function claimEmail(db: D1Like, id: string, now: Date): Promise<EmailOperation | null> {
  return (await claimEmails(db, [id], now))[0] ?? null;
}

export async function finishEmails(db: D1Like, outcomes: { operation: EmailOperation; ok: boolean }[], now: Date): Promise<Set<string>> {
  if (!outcomes.length) return new Set();
  const rows = JSON.stringify(outcomes.map(({ operation, ok }) => ({ id: operation.id, lease: operation.lease_id, ok })));
  const success = `EXISTS (SELECT 1 FROM json_each(?1) j WHERE json_extract(j.value,'$.id')=email_operations.id
    AND json_extract(j.value,'$.lease')=email_operations.lease_id AND json_extract(j.value,'$.ok')=1)`;
  const failure = success.replace("'$.ok')=1", "'$.ok')=0");
  // Log, rotate and mark success in one transaction. A crash before this batch
  // replays the same provider key. The pending recovery alias is already usable.
  await db.batch([
    db.prepare(`INSERT INTO send_log (group_id,participant_id,kind,draw_version,sent_at)
      SELECT group_id,participant_id,kind,draw_version,?2 FROM email_operations WHERE state='sending' AND ${success}`)
      .bind(rows, now.toISOString()),
    db.prepare(`UPDATE groups SET manage_token_hash=(SELECT recovery_token_hash FROM email_operations
        WHERE group_id=groups.id AND kind='recovery' AND state='sending' AND ${success}),revision=revision+1
      WHERE expires_at>?2 AND EXISTS (SELECT 1 FROM email_operations WHERE group_id=groups.id AND kind='recovery'
        AND state='sending' AND previous_manage_hash=groups.manage_token_hash AND recovery_email=groups.organiser_email AND ${success})`)
      .bind(rows, now.toISOString()),
    db.prepare(`UPDATE email_operations SET state='sent',sent_at=?2,payload_sealed=NULL,lease_id=NULL,lease_until=NULL,
        slot=CASE WHEN explicit=1 OR kind='recovery' THEN NULL ELSE slot END
      WHERE state='sending' AND ${success}`).bind(rows, now.toISOString()),
    db.prepare(`UPDATE email_operations SET state='pending',lease_id=NULL,lease_until=NULL WHERE state='sending' AND ${failure}`).bind(rows),
  ]);
  return new Set((await db.prepare(`SELECT id FROM email_operations WHERE state='sent' AND id IN (
    SELECT json_extract(value,'$.id') FROM json_each(?))`).bind(rows).all<{ id: string }>()).results.map(row => row.id));
}

export async function finishEmail(db: D1Like, operation: EmailOperation, ok: boolean, now: Date): Promise<boolean> {
  return (await finishEmails(db, [{ operation, ok }], now)).has(operation.id);
}

export async function findRecoveryGroups(db: D1Like, email: string, now: Date): Promise<GroupRow[]> {
  return (await db.prepare('SELECT * FROM groups WHERE organiser_email=? COLLATE NOCASE AND expires_at>? ORDER BY id')
    .bind(email, now.toISOString()).all<GroupRow>()).results;
}
