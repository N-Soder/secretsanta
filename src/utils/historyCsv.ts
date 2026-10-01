import { EMAIL_PATTERN, LIMITS } from '../api/limits';
import { Participant } from '../types';
import { parseBudgetInput } from './format';
import { parseImportedSettings } from './importSettings';

// Versioned CSV format for a finished draw ("history"). Groups are wiped every
// February, so this file is how an organiser carries a group into next year.
export const HISTORY_CSV_VERSION = 'secret-santa-history/2';

export const HISTORY_CSV_COLUMNS = [
  'format_version', 'exported_at', 'participant_id', 'name', 'email', 'hint',
  'must_give_to_id', 'must_not_give_to_ids', 'gives_to_id', 'gives_to_name',
  'message', 'budget', 'currency', 'event_date',
] as const;

type HistoryCsvColumn = typeof HISTORY_CSV_COLUMNS[number];

export interface PastPairing {
  giverId: string;
  receiverId: string;
}

export interface ExportSettings {
  message: string;
  budgetAmount: number | null; // cents
  budgetCurrency: string;
  eventDate: string | null;
}

export interface ImportedSettings extends ExportSettings {
  organiserEmail: string | null;
}

export interface HistoryExportInput {
  participants: Record<string, Participant>;
  pairings: PastPairing[];
  settings: ExportSettings;
  exportedAt: Date;
}

export interface HistoryImport {
  exportedAt: string | null;
  participants: Record<string, Participant>;
  settings: ImportedSettings;
  pastPairings: PastPairing[];
}

export interface HistoryParseError {
  line: number | null; // 1-based physical CSV record number incl. header, null for file-level
  key:
    | 'emptyFile'
    | 'missingColumns'
    | 'unsupportedVersion'
    | 'malformedCsv'
    | 'missingId'
    | 'duplicateId'
    | 'emptyName'
    | 'duplicateName'
    | 'unknownParticipant'
    | 'conflictingRules'
    | 'invalidEmail'
    // Also produced by the JSON participant list import.
    | 'invalidJson'
    | 'invalidShape'
    | 'invalidEntry'
    | 'invalidField'
    | 'unknownName';
  params?: Record<string, string>;
}

export type HistoryParseResult =
  | { ok: true; data: HistoryImport }
  | { ok: false; errors: HistoryParseError[] };

// --- RFC 4180 helpers ------------------------------------------------------

function needsQuoting(value: string): boolean {
  return /[",\r\n]/.test(value) || value !== value.trim();
}

function csvCell(value: string): string {
  return needsQuoting(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Characters that make a spreadsheet interpret a cell as a formula. Prefixing
// with a single quote neutralises them in Excel/Sheets while staying visible
// as plain text; we strip that leading quote back out again on import.
// Values that already start with quotes before such a character get one more
// quote too, so stripping exactly one on import always restores the original.
const FORMULA_PREFIX = /^'*[=+\-@\t\r]/;

function escapeFormula(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function unescapeFormula(value: string): string {
  return value[0] === '\'' && FORMULA_PREFIX.test(value.slice(1))
    ? value.slice(1)
    : value;
}

// Parses raw CSV text into records of raw string cells. Handles quoted
// fields (commas, doubled quotes, embedded CR/LF) and both CRLF and LF line
// endings. Returns null if a quoted field is never terminated.
function parseCsvRecords(text: string): string[][] | null {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (char === '\r' || char === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
      i += (char === '\r' && text[i + 1] === '\n') ? 2 : 1;
    } else {
      field += char;
      i += 1;
    }
  }

  if (inQuotes) {
    return null;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records;
}

// --- Serialisation ----------------------------------------------------------

const budgetCell = (cents: number | null) => cents === null ? '' : (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);

export function serialiseHistoryCsv(input: HistoryExportInput): string {
  const { participants, pairings, settings, exportedAt } = input;
  const exportedAtIso = exportedAt.toISOString();
  const receiverByGiverId = new Map(pairings.map(({ giverId, receiverId }) => [giverId, receiverId] as const));

  const rows = Object.values(participants)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(participant => {
      const mustRule = participant.rules.find(r => r.type === 'must' && r.targetParticipantId);
      const mustNotIds = participant.rules
        .filter(r => r.type === 'mustNot' && r.origin !== 'history' && r.targetParticipantId)
        .map(r => r.targetParticipantId);
      const receiverId = receiverByGiverId.get(participant.id) ?? '';

      const fields: Record<HistoryCsvColumn, string> = {
        format_version: HISTORY_CSV_VERSION,
        exported_at: exportedAtIso,
        participant_id: participant.id,
        name: participant.name,
        email: participant.email ?? '',
        hint: participant.hint ?? '',
        must_give_to_id: mustRule?.targetParticipantId ?? '',
        must_not_give_to_ids: mustNotIds.join(';'),
        gives_to_id: receiverId,
        gives_to_name: receiverId ? participants[receiverId]?.name ?? '' : '',
        message: settings.message,
        budget: budgetCell(settings.budgetAmount),
        currency: settings.budgetCurrency,
        event_date: settings.eventDate ?? '',
      };

      return HISTORY_CSV_COLUMNS.map(column => csvCell(escapeFormula(fields[column]))).join(',');
    });

  return '\uFEFF' + [HISTORY_CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

// One row per person with their link, for organisers who send links themselves.
export function serialiseLinksCsv(rows: { name: string; email: string | null; link: string }[]): string {
  const lines = rows.map(({ name, email, link }) => [name, email ?? '', link].map(value => csvCell(escapeFormula(value))).join(','));
  return '\uFEFF' + ['name,email,link', ...lines].join('\r\n') + '\r\n';
}

// --- Parsing -----------------------------------------------------------------

export function parseHistoryCsv(text: string): HistoryParseResult {
  const stripped = text.replace(/^\uFEFF/, '');

  if (stripped.trim() === '') {
    return { ok: false, errors: [{ line: null, key: 'emptyFile' }] };
  }

  const records = parseCsvRecords(stripped);
  if (records === null) {
    return { ok: false, errors: [{ line: null, key: 'malformedCsv' }] };
  }

  // Ignore fully blank trailing lines (a single empty cell).
  while (records.length > 0) {
    const last = records[records.length - 1];
    if (last.length === 1 && last[0].trim() === '') {
      records.pop();
    } else {
      break;
    }
  }

  if (records.length === 0) {
    return { ok: false, errors: [{ line: null, key: 'emptyFile' }] };
  }

  const headerRow = records[0].map(h => h.trim());
  const headerIndex = new Map<string, number>();
  headerRow.forEach((header, idx) => {
    headerIndex.set(header.toLowerCase(), idx);
  });

  const REQUIRED_COLUMNS = ['format_version', 'participant_id', 'name'];
  const missingColumns = REQUIRED_COLUMNS.filter(column => !headerIndex.has(column));
  if (missingColumns.length > 0) {
    return {
      ok: false,
      errors: [{ line: 1, key: 'missingColumns', params: { columns: missingColumns.join(', ') } }],
    };
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length > LIMITS.participants) return { ok: false, errors: [{ line: null, key: 'invalidField', params: { field: 'participants', expected: `at most ${LIMITS.participants} people` } }] };
  if (dataRecords.length === 0) {
    return { ok: false, errors: [{ line: null, key: 'emptyFile' }] };
  }

  const getRawCell = (record: string[], column: string): string => {
    const idx = headerIndex.get(column);
    return idx === undefined ? '' : (record[idx] ?? '');
  };
  const getTrimmedCell = (record: string[], column: string): string => getRawCell(record, column).trim();

  // Version must match on every row; report the first mismatch and stop.
  for (let i = 0; i < dataRecords.length; i++) {
    const version = getTrimmedCell(dataRecords[i], 'format_version');
    if (version !== HISTORY_CSV_VERSION) {
      return {
        ok: false,
        errors: [{ line: i + 2, key: 'unsupportedVersion', params: { version } }],
      };
    }
  }

  interface RawRow {
    line: number;
    id: string;
    name: string;
    hint: string;
    email: string;
    mustGiveToId: string;
    mustNotIds: string[];
    givesToId: string;
    valid: boolean;
  }

  const errors: HistoryParseError[] = [];
  const seenIds = new Set<string>();
  const allIds = new Set<string>();
  const seenNamesLower = new Set<string>();
  const rows: RawRow[] = [];

  dataRecords.forEach((record, i) => {
    const line = i + 2;
    const id = unescapeFormula(getTrimmedCell(record, 'participant_id'));
    const name = unescapeFormula(getTrimmedCell(record, 'name'));
    const hint = unescapeFormula(getRawCell(record, 'hint'));
    const email = unescapeFormula(getTrimmedCell(record, 'email'));
    const mustGiveToId = unescapeFormula(getTrimmedCell(record, 'must_give_to_id'));
    const mustNotIds = unescapeFormula(getRawCell(record, 'must_not_give_to_ids'))
      .split(';')
      .map(id => id.trim())
      .filter(Boolean);
    const givesToId = unescapeFormula(getTrimmedCell(record, 'gives_to_id'));

    if (id) {
      allIds.add(id);
    }

    let valid = true;
    if (email && (email.length > LIMITS.email || !EMAIL_PATTERN.test(email))) {
      errors.push({ line, key: 'invalidEmail', params: { email } });
      valid = false;
    }
    if (name.length > LIMITS.name || hint.length > LIMITS.hint) {
      errors.push({ line, key: 'invalidField', params: { field: name.length > LIMITS.name ? 'name' : 'hint', expected: 'within the character limit' } });
      valid = false;
    }

    if (!id) {
      errors.push({ line, key: 'missingId' });
      valid = false;
    } else if (seenIds.has(id)) {
      errors.push({ line, key: 'duplicateId', params: { id } });
      valid = false;
    } else {
      seenIds.add(id);
    }

    if (!name) {
      errors.push({ line, key: 'emptyName' });
      valid = false;
    } else if (seenNamesLower.has(name.toLowerCase())) {
      errors.push({ line, key: 'duplicateName', params: { name } });
      valid = false;
    } else {
      seenNamesLower.add(name.toLowerCase());
    }

    rows.push({ line, id, name, hint, email, mustGiveToId, mustNotIds, givesToId, valid });
  });

  const first = dataRecords[0];
  const budget = parseBudgetInput(getTrimmedCell(first, 'budget'));
  if (budget === undefined) errors.push({ line: 2, key: 'invalidField', params: { field: 'budget', expected: 'an amount like 30 or 29.95' } });
  const parsedSettings = parseImportedSettings({
    message: unescapeFormula(getRawCell(first, 'message')),
    budget: budget === null || budget === undefined ? null : budget / 100,
    currency: getTrimmedCell(first, 'currency') || undefined,
    eventDate: getTrimmedCell(first, 'event_date') || null,
  }, 2);
  errors.push(...parsedSettings.errors);
  const settings = parsedSettings.settings;
  const exportedAtCell = getTrimmedCell(dataRecords[0], 'exported_at');
  const exportedAt = exportedAtCell === '' ? null : exportedAtCell;

  const participants: Record<string, Participant> = Object.create(null);
  const pastPairings: PastPairing[] = [];

  for (const row of rows) {
    if (!row.valid) continue;

    const rules: Participant['rules'] = [];

    if (row.mustGiveToId) {
      if (row.mustGiveToId === row.id || !allIds.has(row.mustGiveToId)) {
        errors.push({ line: row.line, key: 'unknownParticipant', params: { id: row.mustGiveToId } });
      } else {
        rules.push({ type: 'must', targetParticipantId: row.mustGiveToId });
      }
    }

    for (const targetId of row.mustNotIds) {
      if (targetId === row.id || !allIds.has(targetId)) {
        errors.push({ line: row.line, key: 'unknownParticipant', params: { id: targetId } });
        continue;
      }
      if (row.mustGiveToId && targetId === row.mustGiveToId) {
        errors.push({ line: row.line, key: 'conflictingRules', params: { name: row.name } });
        continue;
      }
      rules.push({ type: 'mustNot', targetParticipantId: targetId });
    }

    if (row.givesToId) {
      if (row.givesToId === row.id || !allIds.has(row.givesToId)) {
        errors.push({ line: row.line, key: 'unknownParticipant', params: { id: row.givesToId } });
      } else {
        pastPairings.push({ giverId: row.id, receiverId: row.givesToId });
      }
    }

    participants[row.id] = {
      id: row.id,
      name: row.name,
      hint: row.hint === '' ? undefined : row.hint,
      email: row.email === '' ? undefined : row.email,
      rules,
    };
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: { exportedAt, participants, settings, pastPairings } };
}
