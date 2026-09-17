import { Participant } from '../types';
import { GeneratedPairs } from './generatePairs';

// Versioned CSV format for exporting/importing a finished draw ("history").
// This lets an organiser prefill next year's participants/hints/rules/instructions
// and avoid repeating last year's pairings.
export const HISTORY_CSV_VERSION = 'secret-santa-history/1';

export const HISTORY_CSV_COLUMNS = [
  'format_version', 'exported_at', 'participant_id', 'name', 'hint',
  'must_give_to_id', 'must_not_give_to_ids', 'instructions',
  'gives_to_id', 'gives_to_name', 'private_link',
] as const;

type HistoryCsvColumn = typeof HISTORY_CSV_COLUMNS[number];

export interface PastPairing {
  giverId: string;
  receiverId: string;
}

export interface HistoryExportInput {
  participants: Record<string, Participant>;
  assignments: GeneratedPairs;
  instructions: string;
  links: Record<string, string>; // giver participant id -> private URL
  exportedAt: Date;
}

export interface HistoryImport {
  exportedAt: string | null; // ISO string from the file (first row), or null if blank
  participants: Record<string, Participant>;
  instructions: string;
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
    | 'conflictingRules';
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
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeFormula(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

// Note: a name that genuinely starts with "'=" (or another escaped prefix)
// round-trips as the un-prefixed value - an accepted, rare edge case.
function unescapeFormula(value: string): string {
  return value.length > 1 && value[0] === '\'' && FORMULA_PREFIX.test(value.slice(1))
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

export function serialiseHistoryCsv(input: HistoryExportInput): string {
  const { participants, assignments, instructions, links, exportedAt } = input;
  const exportedAtIso = exportedAt.toISOString();

  const receiverByGiverId = new Map(
    assignments.pairings.map(({ giver, receiver }) => [giver.id, receiver] as const)
  );

  const rows = Object.values(participants)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(participant => {
      const mustRule = participant.rules.find(r => r.type === 'must' && r.targetParticipantId);

      const mustNotIds = participant.rules
        .filter(r => r.type === 'mustNot' && r.origin !== 'history' && r.targetParticipantId)
        .map(r => r.targetParticipantId);

      const receiver = receiverByGiverId.get(participant.id);
      const receiverName = receiver ? (participants[receiver.id]?.name ?? receiver.name) : '';

      const fields: Record<HistoryCsvColumn, string> = {
        format_version: HISTORY_CSV_VERSION,
        exported_at: exportedAtIso,
        participant_id: participant.id,
        name: escapeFormula(participant.name),
        hint: escapeFormula(participant.hint ?? ''),
        must_give_to_id: mustRule?.targetParticipantId ?? '',
        must_not_give_to_ids: mustNotIds.join(';'),
        instructions: escapeFormula(instructions),
        gives_to_id: receiver?.id ?? '',
        gives_to_name: escapeFormula(receiverName),
        private_link: links[participant.id] ?? '',
      };

      return HISTORY_CSV_COLUMNS.map(column => csvCell(fields[column])).join(',');
    });

  const headerRow = HISTORY_CSV_COLUMNS.join(',');
  return '\uFEFF' + [headerRow, ...rows].join('\r\n') + '\r\n';
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
    const id = getTrimmedCell(record, 'participant_id');
    const name = unescapeFormula(getTrimmedCell(record, 'name'));
    const hint = unescapeFormula(getRawCell(record, 'hint'));
    const mustGiveToId = getTrimmedCell(record, 'must_give_to_id');
    const mustNotIds = getRawCell(record, 'must_not_give_to_ids')
      .split(';')
      .map(id => id.trim())
      .filter(Boolean);
    const givesToId = getTrimmedCell(record, 'gives_to_id');

    if (id) {
      allIds.add(id);
    }

    let valid = true;

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

    rows.push({ line, id, name, hint, mustGiveToId, mustNotIds, givesToId, valid });
  });

  const instructions = unescapeFormula(getRawCell(dataRecords[0], 'instructions'));
  const exportedAtCell = getTrimmedCell(dataRecords[0], 'exported_at');
  const exportedAt = exportedAtCell === '' ? null : exportedAtCell;

  const participants: Record<string, Participant> = {};
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
      rules,
    };
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: { exportedAt, participants, instructions, pastPairings } };
}
