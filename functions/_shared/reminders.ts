import type { ReminderKind } from '../../src/api/types';

const SEND_HOUR = 9;

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function localStamp(now: Date, timeZone: string): { date: string; stamp: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, stamp: `${date}T${get('hour')}` };
}

function shiftDate(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const sendStamp = (isoDate: string) => `${isoDate}T${String(SEND_HOUR).padStart(2, '0')}`;

// Which reminder should have gone out by now. Once the 1-day reminder is due the
// 7-day one is never sent late, and nothing is sent on or after the event date.
export function dueReminder(eventDate: string, timeZone: string, now: Date): ReminderKind | null {
  const { date, stamp } = localStamp(now, timeZone);
  if (date >= eventDate) return null;
  if (stamp >= sendStamp(shiftDate(eventDate, -1))) return 'reminder_1d';
  if (stamp >= sendStamp(shiftDate(eventDate, -7))) return 'reminder_7d';
  return null;
}
