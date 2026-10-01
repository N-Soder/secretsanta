// All SQL lives here. Multi-row writes go through json_each(?1) so a whole
// group is a handful of statements, inside D1's per-invocation query limits.
import type { GroupSettings, LogKind, ManageView, ParticipantInput, PatchRequest, SettingsPatch, RevealView } from '../../src/api/types';
import type { Rule } from '../../src/types';
import type { D1Like, D1Stmt } from './db';
import { computeExpiresAt } from './expiry';
import { MANAGE_TOKEN_LENGTH, PARTICIPANT_TOKEN_LENGTH, hashToken, newToken, openToken, sealToken } from './tokens';

export interface GroupRow {
  id: string;
  manage_token_hash: string;
  site_origin: string;
  message: string;
  budget_amount: number | null;
  budget_currency: string;
  event_date: string | null;
  timezone: string;
  reminders_enabled: number;
  organiser_email: string | null;
  draw_version: number;
  revision: number;
  created_at: string;
  expires_at: string;
}

export interface ParticipantRow {
  id: string;
  group_id: string;
  name: string;
  hint: string;
  email: string | null;
  link_token_hash: string;
  link_token_sealed: string;
  wishlist: string;
  first_viewed_at: string | null;
}

export const participantLink = (origin: string, token: string) => `${origin}/s/${token}`;
export const manageLink = (origin: string, token: string) => `${origin}/manage/${token}`;

export function settingsFromRow(group: GroupRow): GroupSettings {
  return {
    message: group.message,
    budgetAmount: group.budget_amount,
    budgetCurrency: group.budget_currency,
    eventDate: group.event_date,
    timezone: group.timezone,
    remindersEnabled: group.reminders_enabled === 1,
    organiserEmail: group.organiser_email,
  };
}

// --- writes shared by create and redraw --------------------------------------

export async function newParticipantRows(people: ParticipantInput[], idFor: (id: string) => string, linkKey: string) {
  return Promise.all(people.map(async person => {
    const token = newToken(PARTICIPANT_TOKEN_LENGTH);
    return {
      id: idFor(person.id), name: person.name, hint: person.hint, email: person.email,
      hash: await hashToken(token), sealed: await sealToken(token, linkKey),
    };
  }));
}

export function insertParticipants(db: D1Like, groupId: string, rows: Awaited<ReturnType<typeof newParticipantRows>>): D1Stmt {
  return db.prepare(`INSERT INTO participants (id, group_id, name, hint, email, link_token_hash, link_token_sealed)
    SELECT json_extract(value, '$.id'), ?2, json_extract(value, '$.name'), json_extract(value, '$.hint'),
           json_extract(value, '$.email'), json_extract(value, '$.hash'), json_extract(value, '$.sealed')
    FROM json_each(?1)`).bind(JSON.stringify(rows), groupId);
}

export function insertRulesAndPairings(
  db: D1Like, groupId: string, people: ParticipantInput[], pairs: Map<string, string>, idFor: (id: string) => string,
): D1Stmt[] {
  const rules = people.flatMap(person => person.rules.map(rule => ({
    giver: idFor(person.id), target: idFor(rule.targetParticipantId), type: rule.type, origin: rule.origin,
  })));
  const pairings = [...pairs].map(([giver, receiver]) => ({ giver: idFor(giver), receiver: idFor(receiver) }));
  return [
    db.prepare(`INSERT INTO rules (group_id, giver_id, target_id, type, origin)
      SELECT ?2, json_extract(value, '$.giver'), json_extract(value, '$.target'), json_extract(value, '$.type'), json_extract(value, '$.origin')
      FROM json_each(?1)`).bind(JSON.stringify(rules), groupId),
    db.prepare(`INSERT INTO pairings (group_id, giver_id, receiver_id)
      SELECT ?2, json_extract(value, '$.giver'), json_extract(value, '$.receiver') FROM json_each(?1)`).bind(JSON.stringify(pairings), groupId),
  ];
}

export async function createGroup(db: D1Like, input: {
  settings: GroupSettings; participants: ParticipantInput[]; pairs: Map<string, string>; linkKey: string; origin: string; now: Date;
}): Promise<{ groupId: string; manageToken: string }> {
  const { settings, participants, pairs, linkKey, origin, now } = input;
  const groupId = crypto.randomUUID();
  const manageToken = newToken(MANAGE_TOKEN_LENGTH);
  const ids = new Map(participants.map(person => [person.id, crypto.randomUUID()]));
  const idFor = (id: string) => ids.get(id)!;

  await db.batch([
    db.prepare(`INSERT INTO groups (id, manage_token_hash, site_origin, message, budget_amount, budget_currency, event_date,
        timezone, reminders_enabled, organiser_email, draw_version, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(
      groupId, await hashToken(manageToken), origin, settings.message, settings.budgetAmount, settings.budgetCurrency,
      settings.eventDate, settings.timezone, settings.remindersEnabled ? 1 : 0, settings.organiserEmail,
      now.toISOString(), computeExpiresAt(now, settings.eventDate),
    ),
    insertParticipants(db, groupId, await newParticipantRows(participants, idFor, linkKey)),
    ...insertRulesAndPairings(db, groupId, participants, pairs, idFor),
  ]);
  return { groupId, manageToken };
}

// --- reads ----------------------------------------------------------------------

export async function findGroupByManageToken(db: D1Like, token: string, now: Date): Promise<GroupRow | null> {
  return db.prepare('SELECT * FROM groups WHERE manage_token_hash = ? AND expires_at > ?')
    .bind(await hashToken(token), now.toISOString()).first<GroupRow>();
}

export async function findParticipantByToken(db: D1Like, token: string, now: Date): Promise<{ participant: ParticipantRow; group: GroupRow } | null> {
  const participant = await db.prepare('SELECT * FROM participants WHERE link_token_hash = ?').bind(await hashToken(token)).first<ParticipantRow>();
  if (!participant) return null;
  const group = await db.prepare('SELECT * FROM groups WHERE id = ? AND expires_at > ?')
    .bind(participant.group_id, now.toISOString()).first<GroupRow>();
  return group ? { participant, group } : null;
}

export async function loadParticipants(db: D1Like, groupId: string): Promise<ParticipantRow[]> {
  const { results } = await db.prepare('SELECT * FROM participants WHERE group_id = ? ORDER BY name COLLATE NOCASE').bind(groupId).all<ParticipantRow>();
  return results;
}

export async function loadRules(db: D1Like, groupId: string): Promise<Map<string, Rule[]>> {
  const { results } = await db.prepare('SELECT giver_id, target_id, type, origin FROM rules WHERE group_id = ?')
    .bind(groupId).all<{ giver_id: string; target_id: string; type: Rule['type']; origin: 'history' | null }>();
  const rules = new Map<string, Rule[]>();
  for (const row of results) {
    const rule: Rule = row.origin ? { type: row.type, targetParticipantId: row.target_id, origin: row.origin } : { type: row.type, targetParticipantId: row.target_id };
    rules.set(row.giver_id, [...(rules.get(row.giver_id) ?? []), rule]);
  }
  return rules;
}

export async function loadPairings(db: D1Like, groupId: string): Promise<Map<string, string>> {
  const { results } = await db.prepare('SELECT giver_id, receiver_id FROM pairings WHERE group_id = ?')
    .bind(groupId).all<{ giver_id: string; receiver_id: string }>();
  return new Map(results.map(row => [row.giver_id, row.receiver_id]));
}

// Latest successful send per person and kind for the current draw.
export async function loadSent(db: D1Like, group: GroupRow): Promise<Map<string, Partial<Record<LogKind, string>>>> {
  const { results } = await db.prepare(`SELECT participant_id, kind, MAX(sent_at) AS sent_at FROM send_log
    WHERE group_id = ? AND participant_id IS NOT NULL AND draw_version = ?
    GROUP BY participant_id, kind`).bind(group.id, group.draw_version).all<{ participant_id: string; kind: LogKind; sent_at: string }>();
  const sent = new Map<string, Partial<Record<LogKind, string>>>();
  for (const row of results) sent.set(row.participant_id, { ...sent.get(row.participant_id), [row.kind]: row.sent_at });
  return sent;
}

export async function linkFor(participant: ParticipantRow, group: GroupRow, linkKey: string): Promise<string> {
  return participantLink(group.site_origin, await openToken(participant.link_token_sealed, linkKey));
}

export async function buildManageView(db: D1Like, group: GroupRow, linkKey: string, emailOn: boolean): Promise<ManageView> {
  const [people, rules, sent] = await Promise.all([loadParticipants(db, group.id), loadRules(db, group.id), loadSent(db, group)]);
  return {
    settings: settingsFromRow(group),
    drawVersion: group.draw_version,
    revision: group.revision,
    createdAt: group.created_at,
    expiresAt: group.expires_at,
    emailEnabled: emailOn,
    participants: await Promise.all(people.map(async person => ({
      id: person.id,
      name: person.name,
      hint: person.hint,
      email: person.email,
      rules: rules.get(person.id) ?? [],
      link: await linkFor(person, group, linkKey),
      opened: person.first_viewed_at !== null,
      sent: sent.get(person.id) ?? {},
    }))),
  };
}

export async function buildRevealView(db: D1Like, participant: ParticipantRow, group: GroupRow): Promise<RevealView> {
  const receiver = await db.prepare(`SELECT r.name, r.hint, r.wishlist FROM pairings p JOIN participants r ON r.id = p.receiver_id
    WHERE p.giver_id = ?`).bind(participant.id).first<{ name: string; hint: string; wishlist: string }>();
  if (!receiver) throw new Error(`No pairing for participant ${participant.id}`);
  return {
    giverName: participant.name,
    receiver,
    ownWishlist: participant.wishlist,
    message: group.message,
    budgetAmount: group.budget_amount,
    budgetCurrency: group.budget_currency,
    eventDate: group.event_date,
    expiresAt: group.expires_at,
  };
}

// --- small writes ----------------------------------------------------------------

export async function markViewed(db: D1Like, participantId: string, now: Date): Promise<void> {
  await db.prepare('UPDATE participants SET first_viewed_at = ? WHERE id = ? AND first_viewed_at IS NULL').bind(now.toISOString(), participantId).run();
}

export async function saveWishlist(db: D1Like, participantId: string, wishlist: string): Promise<void> {
  await db.prepare('UPDATE participants SET wishlist = ? WHERE id = ?').bind(wishlist, participantId).run();
}

export async function countViewed(db: D1Like, groupId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM participants WHERE group_id = ? AND first_viewed_at IS NOT NULL').bind(groupId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function deleteGroup(db: D1Like, groupId: string): Promise<void> {
  await db.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
}

// --- edits -------------------------------------------------------------------------

const SETTINGS_COLUMNS: Record<keyof GroupSettings, string> = {
  message: 'message',
  budgetAmount: 'budget_amount',
  budgetCurrency: 'budget_currency',
  eventDate: 'event_date',
  timezone: 'timezone',
  remindersEnabled: 'reminders_enabled',
  organiserEmail: 'organiser_email',
};

export class MutationConflict extends Error {
  constructor(readonly reason: 'stale' | 'needsConfirm') { super(reason); }
}

async function guardedBatch(db: D1Like, group: GroupRow, statements: D1Stmt[], confirm: boolean): Promise<void> {
  try {
    await db.batch([
      db.prepare(`INSERT INTO write_guards (group_id, version_ok, views_ok) VALUES (?1,
        CASE WHEN EXISTS (SELECT 1 FROM groups WHERE id = ?1 AND revision = ?2 AND draw_version = ?3 AND expires_at > ?5) THEN 1 ELSE 0 END,
        CASE WHEN ?4 = 1 OR NOT EXISTS (SELECT 1 FROM participants WHERE group_id = ?1 AND first_viewed_at IS NOT NULL) THEN 1 ELSE 0 END)`)
        .bind(group.id, group.revision, group.draw_version, confirm ? 1 : 0, new Date().toISOString()),
      ...statements,
      db.prepare('UPDATE groups SET revision = revision + 1 WHERE id = ?').bind(group.id),
      db.prepare('DELETE FROM write_guards WHERE group_id = ?').bind(group.id),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('version_ok')) throw new MutationConflict('stale');
    if (message.includes('views_ok')) throw new MutationConflict('needsConfirm');
    throw error;
  }
}

export type PatchOutcome = { ok: true } | { ok: false; field: string };

function updateParticipantField(db: D1Like, groupId: string, field: 'name' | 'hint' | 'email', rows: object[]): D1Stmt {
  // json_type() is SQL NULL only when the key is absent, so an explicit null email still clears the address.
  return db.prepare(`UPDATE participants
    SET ${field} = (SELECT json_extract(value, '$.${field}') FROM json_each(?1) WHERE json_extract(value, '$.id') = participants.id)
    WHERE group_id = ?2 AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?1) WHERE json_type(value, '$.${field}') IS NOT NULL)`)
    .bind(JSON.stringify(rows), groupId);
}

export async function applyPatch(db: D1Like, group: GroupRow, patch: PatchRequest): Promise<PatchOutcome> {
  const statements: D1Stmt[] = [];
  const currentPeople = await loadParticipants(db, group.id);
  const effective = { ...settingsFromRow(group), ...patch.settings };
  const addressed = currentPeople.some(person => {
    const change = patch.participants?.find(item => item.id === person.id);
    return Boolean(change && 'email' in change ? change.email : person.email);
  });
  if (effective.remindersEnabled && (!effective.eventDate || !addressed)) {
    return { ok: false, field: 'settings.remindersEnabled' };
  }

  if (patch.settings && Object.keys(patch.settings).length > 0) {
    const settings: SettingsPatch = patch.settings;
    const merged = { ...settingsFromRow(group), ...settings };
    if (merged.remindersEnabled && !merged.eventDate) return { ok: false, field: 'settings.remindersEnabled' };

    const keys = Object.keys(settings) as (keyof GroupSettings)[];
    const values = keys.map(key => key === 'remindersEnabled' ? (settings[key] ? 1 : 0) : settings[key]);
    const assignments = keys.map(key => `${SETTINGS_COLUMNS[key]} = ?`);
    if ('eventDate' in settings) {
      assignments.push('expires_at = ?');
      values.push(computeExpiresAt(new Date(group.created_at), merged.eventDate));
    }
    statements.push(db.prepare(`UPDATE groups SET ${assignments.join(', ')} WHERE id = ?`).bind(...values, group.id));
  }

  if (patch.participants && patch.participants.length > 0) {
    const people = currentPeople;
    const names = new Map(people.map(person => [person.id, person.name]));
    for (const [index, change] of patch.participants.entries()) {
      if (!names.has(change.id)) return { ok: false, field: `participants[${index}].id` };
      if (change.name !== undefined) names.set(change.id, change.name);
    }
    const lowered = [...names.values()].map(name => name.toLowerCase());
    for (const [index, change] of patch.participants.entries()) {
      if (change.name !== undefined && lowered.filter(name => name === change.name!.toLowerCase()).length > 1) {
        return { ok: false, field: `participants[${index}].name` };
      }
    }
    for (const field of ['name', 'hint', 'email'] as const) {
      const rows = patch.participants.filter(change => change[field] !== undefined).map(change => ({ id: change.id, [field]: change[field] }));
      if (rows.length > 0) statements.push(updateParticipantField(db, group.id, field, rows));
    }
  }

  if (statements.length > 0) await guardedBatch(db, group, statements, true);
  return { ok: true };
}

// Replaces people, rules and pairings in one transaction. People whose id already
// belongs to the group keep their link and wishlist; everyone's "opened" resets.
export async function replaceDraw(
  db: D1Like, group: GroupRow, people: ParticipantInput[], pairs: Map<string, string>, linkKey: string, confirm = false,
): Promise<void> {
  const existing = new Set((await loadParticipants(db, group.id)).map(person => person.id));
  const ids = new Map(people.map(person => [person.id, existing.has(person.id) ? person.id : crypto.randomUUID()]));
  const idFor = (id: string) => ids.get(id)!;
  const kept = people.filter(person => existing.has(person.id));
  const added = people.filter(person => !existing.has(person.id));

  await guardedBatch(db, group, [
    db.prepare('DELETE FROM pairings WHERE group_id = ?').bind(group.id),
    db.prepare('DELETE FROM rules WHERE group_id = ?').bind(group.id),
    db.prepare('DELETE FROM participants WHERE group_id = ?2 AND id NOT IN (SELECT value FROM json_each(?1))')
      .bind(JSON.stringify(kept.map(person => person.id)), group.id),
    db.prepare(`UPDATE participants SET
        name = (SELECT json_extract(value, '$.name') FROM json_each(?1) WHERE json_extract(value, '$.id') = participants.id),
        hint = (SELECT json_extract(value, '$.hint') FROM json_each(?1) WHERE json_extract(value, '$.id') = participants.id),
        email = (SELECT json_extract(value, '$.email') FROM json_each(?1) WHERE json_extract(value, '$.id') = participants.id),
        first_viewed_at = NULL
      WHERE group_id = ?2`).bind(JSON.stringify(kept.map(({ id, name, hint, email }) => ({ id, name, hint, email }))), group.id),
    insertParticipants(db, group.id, await newParticipantRows(added, idFor, linkKey)),
    ...insertRulesAndPairings(db, group.id, people, pairs, idFor),
    db.prepare('UPDATE groups SET draw_version = draw_version + 1 WHERE id = ?').bind(group.id),
  ], confirm);
}

export async function recordSends(db: D1Like, group: GroupRow, entries: { participantId: string | null; kind: LogKind }[], now: Date): Promise<void> {
  if (entries.length === 0) return;
  await db.prepare(`INSERT INTO send_log (group_id, participant_id, kind, draw_version, sent_at)
    SELECT ?2, json_extract(value, '$.participantId'), json_extract(value, '$.kind'), ?3, ?4 FROM json_each(?1)`)
    .bind(JSON.stringify(entries), group.id, group.draw_version, now.toISOString()).run();
}

// --- recovery and the sweeper ---------------------------------------------------

export async function deleteExpired(db: D1Like, now: Date): Promise<number> {
  return (await db.prepare('DELETE FROM groups WHERE expires_at <= ?').bind(now.toISOString()).run()).meta.changes;
}

export async function reminderGroups(db: D1Like, now: Date): Promise<GroupRow[]> {
  const { results } = await db.prepare(`SELECT * FROM groups WHERE reminders_enabled = 1 AND event_date IS NOT NULL AND expires_at > ?`)
    .bind(now.toISOString()).all<GroupRow>();
  return results;
}

export interface ExportSnapshot {
  group: GroupRow;
  participants: { id: string; name: string; hint: string; email: string | null; link_token_sealed?: string }[];
  rules: { giver_id: string; target_id: string; type: Rule['type']; origin: 'history' | null }[];
  pairings: { giverId: string; receiverId: string }[];
}

// Authenticate and read every export component in one D1 transaction. A redraw,
// deletion or recovery cannot mix group settings with another draw's people.
// Only links exports read sealed links; only history exports read pairings.
export async function loadExportSnapshot(db: D1Like, token: string, format: 'history' | 'links' | 'json', now: Date): Promise<ExportSnapshot | null> {
  const hash = await hashToken(token);
  const activeGroup = 'SELECT id FROM groups WHERE manage_token_hash = ?1 AND expires_at > ?2';
  const bind = (sql: string) => db.prepare(sql).bind(hash, now.toISOString());
  const statements = [
    bind('SELECT * FROM groups WHERE manage_token_hash = ?1 AND expires_at > ?2'),
    bind(`SELECT id, name, hint, email${format === 'links' ? ', link_token_sealed' : ''}
      FROM participants WHERE group_id IN (${activeGroup}) ORDER BY name COLLATE NOCASE`),
  ];
  if (format !== 'links') statements.push(bind(`SELECT giver_id, target_id, type, origin FROM rules WHERE group_id IN (${activeGroup})`));
  if (format === 'history') statements.push(bind(`SELECT giver_id AS giverId, receiver_id AS receiverId FROM pairings WHERE group_id IN (${activeGroup})`));
  const results = await db.batch(statements);
  const rows = <T>(index: number) => (results[index] as { results: T[] }).results;
  const group = rows<GroupRow>(0)[0];
  if (!group) return null;
  return {
    group,
    participants: rows<ExportSnapshot['participants'][number]>(1),
    rules: format === 'links' ? [] : rows<ExportSnapshot['rules'][number]>(2),
    pairings: format === 'history' ? rows<ExportSnapshot['pairings'][number]>(3) : [],
  };
}
