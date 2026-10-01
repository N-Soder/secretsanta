import { describe, expect, it } from 'vitest';
import { HISTORY_CSV_COLUMNS, HISTORY_CSV_VERSION, parseHistoryCsv, serialiseHistoryCsv, serialiseLinksCsv } from './historyCsv';
import { parseParticipantsJson, serialiseParticipantsJson } from './participantsJson';
import { parseParticipantsText } from './parseParticipants';
import { LIMITS } from '../api/limits';

const participants = {
  ann: { id: 'ann', name: 'Ann', hint: 'Tea, "please"\nand coffee', email: '+ann@example.com', rules: [{ type: 'mustNot' as const, targetParticipantId: 'bob', origin: 'history' as const }] },
  bob: { id: 'bob', name: 'Bob', email: 'bob@example.com', rules: [] },
};
const settings = { message: '=Bring a card\nThanks', budgetAmount: 2995, budgetCurrency: 'NZD', eventDate: '2026-12-20', organiserEmail: 'org@example.com' };

describe('history CSV v2', () => {
  it('neutralises imported id cells and restores the rule references on import', () => {
    const people = { a: { id: '-ann', name: 'Ann', rules: [{ type: 'must' as const, targetParticipantId: '+bob' }] }, b: { id: '+bob', name: 'Bob', rules: [] } };
    const csv = serialiseHistoryCsv({ participants: people, pairings: [], settings, exportedAt: new Date('2026-10-01T00:00:00Z') });
    expect(csv).toContain("'-ann");
    expect(csv).toContain("'+bob");
    const parsed = parseHistoryCsv(csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.participants['-ann'].rules).toEqual([{ type: 'must', targetParticipantId: '+bob' }]);
  });
  it('carries emails and group settings without working links or obsolete columns', () => {
    const csv = serialiseHistoryCsv({ participants, settings, pairings: [{ giverId: 'ann', receiverId: 'bob' }], exportedAt: new Date('2026-10-01T00:00:00Z') });
    expect(csv.slice(1).split('\r\n')[0].split(',')).toEqual([...HISTORY_CSV_COLUMNS]);
    expect(csv).toContain('secret-santa-history/2');
    expect(csv).not.toMatch(/private_link|instructions|wishlist|https?:\/\//);
    expect(csv).toContain("'+ann@example.com");
    expect(csv).toContain("'=Bring a card");
    const result = parseHistoryCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.participants.ann.email).toBe('+ann@example.com');
    expect(result.data.participants.ann.hint).toBe(participants.ann.hint);
    expect(result.data.settings).toEqual({ ...settings, organiserEmail: null });
    expect(result.data.pastPairings).toEqual([{ giverId: 'ann', receiverId: 'bob' }]);
    expect(result.data.participants.ann.rules).toEqual([]); // previous history does not accumulate year after year
  });

  it('imports omitted optional fields with empty settings and AUD', () => {
    const result = parseHistoryCsv(`format_version,participant_id,name\n${HISTORY_CSV_VERSION},a,Ann`);
    expect(result.ok && result.data.settings).toEqual({ message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, organiserEmail: null });
  });

  it.each([
    ['email', 'bad'], ['email', 'a'.repeat(255) + '@example.com'],
    ['budget', '-1'], ['budget', '100000.01'], ['budget', '1.234'],
    ['currency', 'nope'], ['event_date', '2026-02-30'], ['message', 'x'.repeat(2001)],
    ['name', 'x'.repeat(81)], ['hint', 'x'.repeat(301)],
  ])('rejects invalid %s', (field, value) => {
    const cell = `"${value.replace(/"/g, '""')}"`;
    const extra = field === 'name' ? '' : `,${field}`;
    const row = field === 'name' ? `${HISTORY_CSV_VERSION},a,${cell}` : `${HISTORY_CSV_VERSION},a,Ann,${cell}`;
    expect(parseHistoryCsv(`format_version,participant_id,name${extra}\n${row}`).ok).toBe(false);
  });

  it('keeps unusual participant ids as own keys rather than changing the result prototype', () => {
    const result = parseHistoryCsv(`format_version,participant_id,name\n${HISTORY_CSV_VERSION},__proto__,Ann`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.participants)).toEqual(['__proto__']);
    expect(result.data.participants.__proto__.name).toBe('Ann');
  });

  it('exports links CSV with emails and neutralises user-controlled formula cells', () => {
    expect(serialiseLinksCsv([{ name: '=Ann', email: '+ann@example.com', link: 'https://x.test/s/abcdefgh12' }, { name: 'Bob', email: null, link: 'https://x.test/s/abcdefgh13' }])).toBe(
      '\uFEFFname,email,link\r\n\'=Ann,\'+ann@example.com,https://x.test/s/abcdefgh12\r\nBob,,https://x.test/s/abcdefgh13\r\n',
    );
  });
});

describe('JSON settings and constraints', () => {
  it('treats optional blank email addresses as unset', () => {
    const result = parseParticipantsJson(JSON.stringify({ organiserEmail: '   ', participants: [{ name: 'Ann', email: '   ' }, 'Bob'] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.settings.organiserEmail).toBeNull();
    expect(Object.values(result.data.participants)[0].email).toBeUndefined();
  });
  it('round-trips email, settings and history-derived exclusions using names', () => {
    const text = serialiseParticipantsJson(participants, settings);
    expect(text).not.toMatch(/wishlist|pairings|link|targetParticipantId|"id"/);
    const parsed = parseParticipantsJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.settings).toEqual(settings);
    const ann = Object.values(parsed.data.participants).find(person => person.name === 'Ann')!;
    const bob = Object.values(parsed.data.participants).find(person => person.name === 'Bob')!;
    expect(ann.email).toBe('+ann@example.com');
    expect(ann.rules).toEqual([{ type: 'mustNot', targetParticipantId: bob.id }]);
    expect(JSON.parse(serialiseParticipantsJson(parsed.data.participants, parsed.data.settings))).toEqual(JSON.parse(text));
  });

  it.each([
    { budget: -1 }, { budget: 100000.01 }, { budget: 1.234 }, { budget: '30' },
    { currency: 'nope' }, { eventDate: '2026-02-30' }, { eventDate: 'not-a-date' },
    { organiserEmail: 'bad' }, { message: 'x'.repeat(2001) },
    { participants: [{ name: 'Ann', email: 'bad' }, 'Bob'] },
    { participants: [{ name: 'Ann', hint: 'x'.repeat(301) }, 'Bob'] },
    { participants: ['x'.repeat(81), 'Bob'] },
  ])('rejects invalid settings or participants: %j', invalid => {
    expect(parseParticipantsJson(JSON.stringify({ participants: ['Ann', 'Bob'], ...invalid })).ok).toBe(false);
  });

  it('accepts zero budgets, exact cents, leap days and normalised emails/currency', () => {
    const result = parseParticipantsJson(JSON.stringify({ participants: [{ name: 'Ann', email: ' ann@example.com ' }, 'Bob'], budget: 0, currency: 'nzd', eventDate: '2028-02-29', organiserEmail: ' org@example.com ' }));
    expect(result.ok && result.data.settings).toEqual({ message: '', budgetAmount: 0, budgetCurrency: 'NZD', eventDate: '2028-02-29', organiserEmail: 'org@example.com' });
  });

  it('bounds the number of people in both formats', () => {
    const names = Array.from({ length: LIMITS.participants + 1 }, (_, index) => `Person ${index}`);
    expect(parseParticipantsJson(JSON.stringify(names)).ok).toBe(false);
    const csv = ['format_version,participant_id,name', ...names.map((name, index) => `${HISTORY_CSV_VERSION},p${index},${name}`)].join('\n');
    expect(parseHistoryCsv(csv).ok).toBe(false);
  });

  it('preserves imported emails when the setup is edited as text', () => {
    const parsed = parseParticipantsText('Ann (coffee) !Bob\nBob', participants);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.participants.ann.email).toBe('+ann@example.com');
    expect(parsed.participants.ann.hint).toBe('coffee');
    expect(parsed.participants.ann.rules[0].origin).toBe('history');
  });
});
