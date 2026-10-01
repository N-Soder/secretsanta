import { describe, expect, it } from 'vitest';
import { sanitiseParticipants, sanitiseSettings } from './setupDraft';

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
