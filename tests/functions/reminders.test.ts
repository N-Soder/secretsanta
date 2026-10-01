import { describe, expect, it } from 'vitest';
import { dueReminder, isValidTimeZone } from '../../functions/_shared/reminders';

const PERTH = 'Australia/Perth'; // UTC+8, no daylight saving

describe('dueReminder', () => {
  const event = '2026-12-20';
  it.each([
    ['2026-12-13T00:59:00Z', null],           // 08:59 Perth, 7 days before
    ['2026-12-13T01:00:00Z', 'reminder_7d'],  // 09:00 Perth, 7 days before
    ['2026-12-15T12:00:00Z', 'reminder_7d'],  // still in the 7-day window
    ['2026-12-19T00:59:00Z', 'reminder_7d'],
    ['2026-12-19T01:00:00Z', 'reminder_1d'],  // 09:00 Perth the day before
    ['2026-12-19T15:59:00Z', 'reminder_1d'],  // 23:59 Perth the day before
    ['2026-12-19T16:00:00Z', null],           // midnight Perth on the day: too late
    ['2026-12-21T01:00:00Z', null],
  ])('at %s → %s', (now, expected) => {
    expect(dueReminder(event, PERTH, new Date(now))).toBe(expected);
  });

  it('uses the group timezone, not UTC', () => {
    // 09:00 on 19 Dec in Sydney (UTC+11) is 22:00 UTC on 18 Dec.
    expect(dueReminder(event, 'Australia/Sydney', new Date('2026-12-18T22:00:00Z'))).toBe('reminder_1d');
    expect(dueReminder(event, 'UTC', new Date('2026-12-18T22:00:00Z'))).toBe('reminder_7d');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isValidTimeZone('Australia/Perth')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
