import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  HISTORY_CSV_VERSION,
  HISTORY_CSV_COLUMNS,
  serialiseHistoryCsv,
  parseHistoryCsv,
  HistoryExportInput,
} from './historyCsv';
import { Participant } from '../types';
import { GeneratedPairs } from './generatePairs';

function makeInput(overrides: Partial<HistoryExportInput> = {}): HistoryExportInput {
  const participants: Record<string, Participant> = {
    alice: { id: 'alice', name: 'Alice', hint: 'likes cats', rules: [] },
    bob: { id: 'bob', name: 'Bob', rules: [] },
    charlie: { id: 'charlie', name: 'Charlie', rules: [] },
  };

  return {
    participants,
    pairings: [
      { giverId: 'alice', receiverId: 'bob' }, { giverId: 'bob', receiverId: 'charlie' }, { giverId: 'charlie', receiverId: 'alice' },
    ],
    settings: { message: 'Spend no more than $20.', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null },
    exportedAt: new Date('2025-12-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('serialiseHistoryCsv', () => {
  it('emits a BOM, CRLF line endings and the expected header', () => {
    const csv = serialiseHistoryCsv(makeInput());

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
    expect(csv).not.toMatch(/[^\r]\n/); // every \n is preceded by \r

    const withoutBom = csv.slice(1);
    const [headerLine] = withoutBom.split('\r\n');
    expect(headerLine.split(',')).toEqual([...HISTORY_CSV_COLUMNS]);
  });

  it('sorts rows by name and fills in giver/receiver data', () => {
    const csv = serialiseHistoryCsv(makeInput());
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.values(result.data.participants).map(p => p.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    expect(result.data.pastPairings).toEqual(
      expect.arrayContaining([
        { giverId: 'alice', receiverId: 'bob' },
        { giverId: 'bob', receiverId: 'charlie' },
        { giverId: 'charlie', receiverId: 'alice' },
      ])
    );
  });

  it('excludes history-origin mustNot rules but keeps other rules', () => {
    const input = makeInput({
      participants: {
        alice: {
          id: 'alice',
          name: 'Alice',
          rules: [
            { type: 'mustNot', targetParticipantId: 'bob', origin: 'history' },
            { type: 'mustNot', targetParticipantId: 'charlie' },
          ],
        },
        bob: { id: 'bob', name: 'Bob', rules: [{ type: 'must', targetParticipantId: 'charlie' }] },
        charlie: { id: 'charlie', name: 'Charlie', rules: [] },
      },
    });

    const csv = serialiseHistoryCsv(input);
    const lines = csv.slice(1).split('\r\n');
    const aliceLine = lines.find(l => l.startsWith(`${HISTORY_CSV_VERSION}`) && l.includes(',alice,'));
    expect(aliceLine).toBeDefined();
    expect(aliceLine).toContain(',charlie,'); // must_not_give_to_ids column contains charlie
    expect(aliceLine).not.toContain('bob,charlie'); // history-origin bob target excluded

    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.participants.alice.rules).toEqual([
      { type: 'mustNot', targetParticipantId: 'charlie' },
    ]);
    expect(result.data.participants.bob.rules).toEqual([
      { type: 'must', targetParticipantId: 'charlie' },
    ]);
  });
});

describe('parseHistoryCsv - round trip', () => {
  it('round-trips participants, hints, rules, message and pairings with awkward values', () => {
    const participants: Record<string, Participant> = {
      p1: { id: 'p1', name: 'Zoë "The Great" Smith', hint: 'loves, commas "and" quotes\nand newlines', rules: [{ type: 'must', targetParticipantId: 'p2' }] },
      p2: { id: 'p2', name: '🎁 Émile', hint: undefined, rules: [{ type: 'mustNot', targetParticipantId: 'p1' }, { type: 'mustNot', targetParticipantId: 'p3' }] },
      p3: { id: 'p3', name: '=SUM(1,2)', hint: '-danger', rules: [] },
      p4: { id: 'p4', name: '@mentioned', hint: '+plus', rules: [] },
    };

    const assignments: GeneratedPairs = {
      hash: 'h',
      pairings: [
        { giver: { id: 'p1', name: participants.p1.name }, receiver: { id: 'p2', name: participants.p2.name } },
        { giver: { id: 'p2', name: participants.p2.name }, receiver: { id: 'p3', name: participants.p3.name } },
        { giver: { id: 'p3', name: participants.p3.name }, receiver: { id: 'p4', name: participants.p4.name } },
        { giver: { id: 'p4', name: participants.p4.name }, receiver: { id: 'p1', name: participants.p1.name } },
      ],
    };

    const input: HistoryExportInput = {
      participants,
      pairings: assignments.pairings.map(({ giver, receiver }) => ({ giverId: giver.id, receiverId: receiver.id })),
      settings: { ...makeInput().settings, message: 'Budget: "$20", no more, no less.\nThanks!' },

      exportedAt: new Date('2024-12-25T00:00:00.000Z'),
    };

    const csv = serialiseHistoryCsv(input);
    const result = parseHistoryCsv(csv);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.exportedAt).toBe('2024-12-25T00:00:00.000Z');
    expect(result.data.settings.message).toBe(input.settings.message);

    for (const id of Object.keys(participants)) {
      expect(result.data.participants[id].name).toBe(participants[id].name);
      expect(result.data.participants[id].hint).toBe(participants[id].hint);
      expect(result.data.participants[id].rules).toEqual(participants[id].rules);
    }

    expect(result.data.pastPairings).toEqual(
      expect.arrayContaining(assignments.pairings.map(p => ({ giverId: p.giver.id, receiverId: p.receiver.id })))
    );
  });

  it('accepts LF-only line endings, reordered columns and extra unknown columns', () => {
    const rows = [
      'name,extra_column,participant_id,format_version',
      `Alice,ignored,a1,${HISTORY_CSV_VERSION}`,
      `Bob,ignored,a2,${HISTORY_CSV_VERSION}`,
    ];
    const csv = rows.join('\n');

    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.data.participants).sort()).toEqual(['a1', 'a2']);
    expect(result.data.participants.a1.name).toBe('Alice');
  });

  it('is case-insensitive and trims header names', () => {
    const rows = [
      ' Format_Version , Participant_Id , NAME ',
      `${HISTORY_CSV_VERSION},a1,Alice`,
    ];
    const csv = rows.join('\r\n');

    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(true);
  });
});

describe('parseHistoryCsv - errors', () => {
  it('returns emptyFile for blank text', () => {
    const result = parseHistoryCsv('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: null, key: 'emptyFile' }]);
  });

  it('returns emptyFile for header-only text', () => {
    const result = parseHistoryCsv(`format_version,participant_id,name\r\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: null, key: 'emptyFile' }]);
  });

  it('returns missingColumns when required columns are absent', () => {
    const result = parseHistoryCsv(`participant_id,name\r\na1,Alice\r\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { line: 1, key: 'missingColumns', params: { columns: 'format_version' } },
    ]);
  });

  it('returns malformedCsv for an unterminated quoted field', () => {
    const result = parseHistoryCsv(`format_version,participant_id,name\r\n${HISTORY_CSV_VERSION},a1,"Alice\r\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: null, key: 'malformedCsv' }]);
  });

  it('returns unsupportedVersion and stops at the first mismatching row', () => {
    const csv = `format_version,participant_id,name\r\nsecret-santa-history/1,a1,Alice\r\n`;
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { line: 2, key: 'unsupportedVersion', params: { version: 'secret-santa-history/1' } },
    ]);
  });

  it('returns missingId for a blank participant_id', () => {
    const csv = `format_version,participant_id,name\r\n${HISTORY_CSV_VERSION},,Alice\r\n`;
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: 2, key: 'missingId' }]);
  });

  it('returns duplicateId for repeated participant_id', () => {
    const csv = [
      'format_version,participant_id,name',
      `${HISTORY_CSV_VERSION},a1,Alice`,
      `${HISTORY_CSV_VERSION},a1,Bob`,
    ].join('\r\n');
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: 3, key: 'duplicateId', params: { id: 'a1' } }]);
  });

  it('returns emptyName for a blank name', () => {
    const csv = `format_version,participant_id,name\r\n${HISTORY_CSV_VERSION},a1,\r\n`;
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: 2, key: 'emptyName' }]);
  });

  it('returns duplicateName for repeated names (case-insensitive, trimmed)', () => {
    const csv = [
      'format_version,participant_id,name',
      `${HISTORY_CSV_VERSION},a1,Alice`,
      `${HISTORY_CSV_VERSION},a2, alice `,
    ].join('\r\n');
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: 3, key: 'duplicateName', params: { name: 'alice' } }]);
  });

  it('returns unknownParticipant for a must_give_to_id not present in the file', () => {
    const csv = `format_version,participant_id,name,must_give_to_id\r\n${HISTORY_CSV_VERSION},a1,Alice,ghost\r\n`;
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: 2, key: 'unknownParticipant', params: { id: 'ghost' } }]);
  });

  it('returns unknownParticipant for a must_give_to_id equal to self', () => {
    const csv = `format_version,participant_id,name,must_give_to_id\r\n${HISTORY_CSV_VERSION},a1,Alice,a1\r\n`;
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: 2, key: 'unknownParticipant', params: { id: 'a1' } }]);
  });

  it('returns unknownParticipant for a gives_to_id not present in the file', () => {
    const csv = `format_version,participant_id,name,gives_to_id\r\n${HISTORY_CSV_VERSION},a1,Alice,ghost\r\n`;
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: 2, key: 'unknownParticipant', params: { id: 'ghost' } }]);
  });

  it('returns conflictingRules when a mustNot target equals the must target', () => {
    const csv = [
      'format_version,participant_id,name,must_give_to_id,must_not_give_to_ids',
      `${HISTORY_CSV_VERSION},a1,Alice,a2,a2`,
      `${HISTORY_CSV_VERSION},a2,Bob,,`,
    ].join('\r\n');
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: 2, key: 'conflictingRules', params: { name: 'Alice' } }]);
  });

  it('collects multiple row errors rather than stopping at the first', () => {
    const csv = [
      'format_version,participant_id,name',
      `${HISTORY_CSV_VERSION},,Alice`,
      `${HISTORY_CSV_VERSION},a2,`,
    ].join('\r\n');
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { line: 2, key: 'missingId' },
      { line: 3, key: 'emptyName' },
    ]);
  });
});

describe('formula injection protection', () => {
  it('prefixes dangerous leading characters on export and strips them back on import', () => {
    const dangerous = ['=SUM(1,2)', '+1', '-1', '@cmd', '\ttab', '\rcarriage'];

    for (const value of dangerous) {
      const input = makeInput({
        participants: { a1: { id: 'a1', name: value, rules: [] } },
        pairings: [],
      });
      const csv = serialiseHistoryCsv(input);
      expect(csv).toContain(`'${value}`); // escaped form present in output

      const result = parseHistoryCsv(csv);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.data.participants.a1.name).toBe(value);
    }
  });

  it('round-trips values that already start with quotes before a dangerous character', () => {
    const quoted = ["'@", "'=1", "''+x", "'-", "'"];

    for (const value of quoted) {
      const input = makeInput({
        participants: { a1: { id: 'a1', name: value, rules: [] } },
        pairings: [],
      });

      const result = parseHistoryCsv(serialiseHistoryCsv(input));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.data.participants.a1.name).toBe(value);
    }
  });
});

describe('serialiseHistoryCsv <-> parseHistoryCsv property round trip', () => {
  const textArb = fc.string().filter(s => s.trim().length > 0);
  const nameArb = fc.string({ minLength: 1 }).map(s => s.trim()).filter(s => s.length > 0);

  it('round-trips arbitrary names, hints and message', () => {
    fc.assert(
      fc.property(
        nameArb,
        fc.option(textArb, { nil: undefined }),
        textArb,
        (name, hint, instructions) => {
          const input = makeInput({
            participants: { a1: { id: 'a1', name, hint, rules: [] } },
            pairings: [],
            settings: { ...makeInput().settings, message: instructions },
          });

          const csv = serialiseHistoryCsv(input);
          const result = parseHistoryCsv(csv);

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          expect(result.data.participants.a1.name).toBe(name);
          expect(result.data.participants.a1.hint).toBe(hint);
          expect(result.data.settings.message).toBe(instructions);
        }
      )
    );
  });
});
