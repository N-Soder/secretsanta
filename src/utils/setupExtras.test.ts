import { describe, expect, it } from 'vitest';
import { buildCreateRequest, extrasWithValues } from './setupExtras';
import type { ImportedSettings } from './historyCsv';
import type { Participant } from '../types';

const EMPTY: ImportedSettings = { message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, organiserEmail: null };
const people: Record<string, Participant> = {
  a: { id: 'a', name: 'Ann', email: ' ann@example.com ', rules: [] },
  b: { id: 'b', name: 'Bob', hint: 'Tea', rules: [] },
};

describe('setup extras', () => {
  it('opens only the extras that already have values', () => {
    expect([...extrasWithValues(EMPTY, '', {})]).toEqual([]);
    expect([...extrasWithValues({ ...EMPTY, budgetAmount: 3000, eventDate: '2026-12-20' }, 'Hi', {})].sort()).toEqual(['budget', 'date', 'message']);
    expect([...extrasWithValues({ ...EMPTY, organiserEmail: 'o@example.com' }, '', {})]).toEqual(['email']);
    expect([...extrasWithValues(EMPTY, '', people)]).toEqual(['email']);
  });

  it('never submits a hidden extra', () => {
    const settings = { ...EMPTY, budgetAmount: 3000, eventDate: '2026-12-20', organiserEmail: 'o@example.com' };
    const request = buildCreateRequest({ settings, message: 'Hi', participants: people, open: new Set(), emailEnabled: true, reminders: true, timezone: 'Australia/Perth' });
    expect(request.settings).toEqual({ message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, timezone: 'Australia/Perth', remindersEnabled: false, organiserEmail: null });
    expect(request.participants.map(person => person.email)).toEqual([null, null]);
  });

  it('submits open extras, trimmed emails and reminders only when they can be sent', () => {
    const settings = { ...EMPTY, budgetAmount: 3000, eventDate: '2026-12-20', organiserEmail: ' o@example.com ' };
    const open = new Set(['message', 'budget', 'date', 'email'] as const);
    const request = buildCreateRequest({ settings, message: 'Hi', participants: people, open, emailEnabled: true, reminders: true, timezone: 'UTC' });
    expect(request.settings).toMatchObject({ message: 'Hi', budgetAmount: 3000, eventDate: '2026-12-20', remindersEnabled: true, organiserEmail: 'o@example.com' });
    expect(request.participants).toEqual([
      { id: 'a', name: 'Ann', hint: '', email: 'ann@example.com', rules: [] },
      { id: 'b', name: 'Bob', hint: 'Tea', email: null, rules: [] },
    ]);
    const noAddresses = buildCreateRequest({ settings, message: '', participants: { b: people.b }, open, emailEnabled: true, reminders: true, timezone: 'UTC' });
    expect(noAddresses.settings.remindersEnabled).toBe(false);
    const noDate = buildCreateRequest({ settings, message: '', participants: people, open: new Set(['email'] as const), emailEnabled: true, reminders: true, timezone: 'UTC' });
    expect(noDate.settings.remindersEnabled).toBe(false);
  });

  it('ignores email extras when the site has email switched off', () => {
    const request = buildCreateRequest({ settings: { ...EMPTY, organiserEmail: 'o@example.com', eventDate: '2026-12-20' }, message: '', participants: people, open: new Set(['email', 'date'] as const), emailEnabled: false, reminders: true, timezone: 'UTC' });
    expect(request.settings.organiserEmail).toBeNull();
    expect(request.settings.remindersEnabled).toBe(false);
    expect(request.participants[0].email).toBeNull();
  });
});
