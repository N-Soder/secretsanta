import { describe, expect, it } from 'vitest';
import { migrateBrowserDraft, sanitiseParticipants, sanitiseSettings } from './setupDraft';

describe('setup draft privacy', () => {
  it('retains identities, hints and history rules without participant emails', () => {
    const person = { id: 'a', name: 'Alice', hint: 'Books', email: 'alice@example.com', rules: [{ type: 'mustNot' as const, targetParticipantId: 'b', origin: 'history' as const }] };
    expect(sanitiseParticipants({ a: person })).toEqual({ a: { id: 'a', name: 'Alice', hint: 'Books', rules: person.rules } });
    expect(person.email).toBe('alice@example.com');
  });
  it('preserves imported draw details without the organiser address', () => {
    expect(sanitiseSettings({ message: 'Hello', budgetAmount: 3500, budgetCurrency: 'EUR', eventDate: '2026-12-20', organiserEmail: 'a@example.com' }).organiserEmail).toBeNull();
  });
});

describe('legacy storage retirement', () => {
  it('removes assignments and addresses on direct token visits without removing continuation', () => {
    const entries = new Map([
      ['secretSantaAssignments', '{"pairings":[1]}'],
      ['secretSantaManageToken', '"private-manage"'],
      ['secretSantaParticipants', JSON.stringify([{ name: 'Ann', email: 'ann@example.com', rules: [] }])],
      ['secretSantaImportedSettings', JSON.stringify({ budgetAmount: 3000, organiserEmail: 'ann@example.com' })],
    ]);
    migrateBrowserDraft({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: key => { entries.delete(key); } });
    expect(entries.has('secretSantaAssignments')).toBe(false);
    expect(entries.get('secretSantaParticipants')).toBe('[{"name":"Ann","rules":[]}]');
    expect(JSON.parse(entries.get('secretSantaImportedSettings')!).organiserEmail).toBeNull();
    expect(entries.get('secretSantaManageToken')).toBe('"private-manage"');
  });
});
