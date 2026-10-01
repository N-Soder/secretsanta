import { describe, expect, it } from 'vitest';
import {
  normaliseEmail, validateParticipantPatches, validateParticipants, validateSettings, validateSettingsPatch, validateWishlist,
} from '../../functions/_shared/validate';

const SETTINGS = {
  message: 'Be nice', budgetAmount: 3000, budgetCurrency: 'AUD', eventDate: '2026-12-20',
  timezone: 'Australia/Perth', remindersEnabled: true, organiserEmail: ' Nick@Example.com ',
};
const person = (id: string, name: string, extra: object = {}) => ({ id, name, hint: '', email: null, rules: [], ...extra });

describe('normaliseEmail', () => {
  it('trims and keeps case-insensitive comparison to the caller', () => {
    expect(normaliseEmail(' a@b.co ')).toBe('a@b.co');
  });
  it('treats empty as none', () => {
    expect(normaliseEmail('')).toBeNull();
    expect(normaliseEmail(null)).toBeNull();
  });
  it('rejects junk', () => {
    expect(normaliseEmail('nope')).toBeUndefined();
    expect(normaliseEmail(42)).toBeUndefined();
  });
});

describe('validateSettings', () => {
  it('accepts and normalises a full settings object', () => {
    expect(validateSettings(SETTINGS)).toEqual({ ok: true, value: { ...SETTINGS, organiserEmail: 'Nick@Example.com' } });
  });
  it.each([
    ['message', 'x'.repeat(2001)],
    ['budgetAmount', -1],
    ['budgetAmount', 1.5],
    ['budgetCurrency', 'aud'],
    ['eventDate', '2026-13-40'],
    ['timezone', 'Mars/Olympus'],
    ['remindersEnabled', 'yes'],
    ['organiserEmail', 'nope'],
  ])('rejects a bad %s', (field, value) => {
    expect(validateSettings({ ...SETTINGS, [field]: value })).toEqual({ ok: false, field: `settings.${field}` });
  });
  it('rejects reminders without a date', () => {
    expect(validateSettings({ ...SETTINGS, eventDate: null })).toEqual({ ok: false, field: 'settings.remindersEnabled' });
  });
});

describe('validateSettingsPatch', () => {
  it('accepts a subset', () => {
    expect(validateSettingsPatch({ message: 'Hi' })).toEqual({ ok: true, value: { message: 'Hi' } });
  });
  it('rejects unknown keys', () => {
    expect(validateSettingsPatch({ drawVersion: 3 })).toEqual({ ok: false, field: 'settings.drawVersion' });
  });
});

describe('validateParticipants', () => {
  it('accepts a valid list and trims names', () => {
    const result = validateParticipants([person('a', ' Ann '), person('b', 'Bob', { rules: [{ type: 'mustNot', targetParticipantId: 'a' }] })]);
    expect(result.ok && result.value.map(p => p.name)).toEqual(['Ann', 'Bob']);
  });
  it('needs at least two people', () => {
    expect(validateParticipants([person('a', 'Ann')])).toEqual({ ok: false, field: 'participants' });
  });
  it('rejects names that differ only by case', () => {
    expect(validateParticipants([person('a', 'Ann'), person('b', 'ann')])).toEqual({ ok: false, field: 'participants[1].name' });
  });
  it('rejects rules pointing outside the list or at yourself', () => {
    expect(validateParticipants([person('a', 'Ann', { rules: [{ type: 'must', targetParticipantId: 'zzz' }] }), person('b', 'Bob')]))
      .toEqual({ ok: false, field: 'participants[0].rules' });
    expect(validateParticipants([person('a', 'Ann', { rules: [{ type: 'must', targetParticipantId: 'a' }] }), person('b', 'Bob')]))
      .toEqual({ ok: false, field: 'participants[0].rules' });
  });
  it('rejects conflicting and duplicate rules', () => {
    const rules = [{ type: 'must', targetParticipantId: 'b' }, { type: 'mustNot', targetParticipantId: 'b' }];
    expect(validateParticipants([person('a', 'Ann', { rules }), person('b', 'Bob')])).toEqual({ ok: false, field: 'participants[0].rules' });
    const dupes = [{ type: 'mustNot', targetParticipantId: 'b' }, { type: 'mustNot', targetParticipantId: 'b' }];
    expect(validateParticipants([person('a', 'Ann', { rules: dupes }), person('b', 'Bob')])).toEqual({ ok: false, field: 'participants[0].rules' });
  });
  it('rejects bad ids', () => {
    expect(validateParticipants([person('a b', 'Ann'), person('b', 'Bob')])).toEqual({ ok: false, field: 'participants[0].id' });
  });
});

describe('validateParticipantPatches', () => {
  it('accepts partial updates', () => {
    expect(validateParticipantPatches([{ id: 'a', email: 'x@y.co' }])).toEqual({ ok: true, value: [{ id: 'a', email: 'x@y.co' }] });
  });
  it('rejects an empty name', () => {
    expect(validateParticipantPatches([{ id: 'a', name: '  ' }])).toEqual({ ok: false, field: 'participants[0].name' });
  });
});

describe('validateWishlist', () => {
  it('limits length', () => {
    expect(validateWishlist('x'.repeat(1000)).ok).toBe(true);
    expect(validateWishlist('x'.repeat(1001))).toEqual({ ok: false, field: 'wishlist' });
  });
});
