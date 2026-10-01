import { CURRENCY_PATTERN, DATE_PATTERN, EMAIL_PATTERN, LIMITS } from '../api/limits';
import type { HistoryParseError, ImportedSettings } from './historyCsv';

// File budgets are in major units; the API and database use integer cents.
export function parseImportedSettings(raw: Record<string, unknown>, line: number | null = null): {
  settings: ImportedSettings; errors: HistoryParseError[];
} {
  const settings: ImportedSettings = { message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, organiserEmail: null };
  const errors: HistoryParseError[] = [];
  const invalid = (field: string, expected: string) => errors.push({ line, key: 'invalidField', params: { field, expected } });
  if (raw.message !== undefined) {
    if (typeof raw.message === 'string' && raw.message.length <= LIMITS.message) settings.message = raw.message;
    else invalid('message', `text of at most ${LIMITS.message} characters`);
  }
  if (raw.budget !== undefined && raw.budget !== null) {
    const cents = typeof raw.budget === 'number' ? Math.round(raw.budget * 100) : NaN;
    if (typeof raw.budget === 'number' && Number.isFinite(raw.budget) && raw.budget >= 0 &&
      Number.isSafeInteger(cents) && cents <= LIMITS.budgetMaxCents && Math.abs(raw.budget * 100 - cents) < 1e-7) {
      settings.budgetAmount = cents;
    } else invalid('budget', 'a non-negative amount with at most two decimal places, up to 100000');
  }
  if (raw.currency !== undefined) {
    const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
    if (CURRENCY_PATTERN.test(currency)) settings.budgetCurrency = currency;
    else invalid('currency', 'a three-letter code like AUD');
  }
  if (raw.eventDate !== undefined && raw.eventDate !== null) {
    const value = raw.eventDate;
    const date = typeof value === 'string' && DATE_PATTERN.test(value) ? new Date(`${value}T00:00:00Z`) : null;
    if (date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) settings.eventDate = value as string;
    else invalid('eventDate', 'a real date like 2026-12-20');
  }
  if (raw.organiserEmail !== undefined && raw.organiserEmail !== null && raw.organiserEmail !== '') {
    const email = typeof raw.organiserEmail === 'string' ? raw.organiserEmail.trim() : '';
    if (typeof raw.organiserEmail === 'string' && email === '') settings.organiserEmail = null;
    else if (email.length <= LIMITS.email && EMAIL_PATTERN.test(email)) settings.organiserEmail = email;
    else errors.push({ line, key: 'invalidEmail', params: { email } });
  }
  return { settings, errors };
}
