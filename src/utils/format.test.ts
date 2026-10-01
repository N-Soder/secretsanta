import { describe, expect, it } from 'vitest';
import { formatBudget, formatEventDate, formatExpiry, parseBudgetInput } from './format';

describe('formatBudget', () => {
  it('drops cents for whole amounts', () => {
    expect(formatBudget(3000, 'AUD')).toBe('$30');
  });
  it('keeps cents otherwise', () => {
    expect(formatBudget(2995, 'AUD')).toBe('$29.95');
  });
  it('labels other currencies', () => {
    expect(formatBudget(2500, 'USD')).toBe('USD 25');
  });
});

describe('formatEventDate', () => {
  it('formats a date-only string without shifting the day', () => {
    expect(formatEventDate('2026-12-20')).toBe('20 December 2026');
  });
});

describe('formatExpiry', () => {
  it('formats the wipe instant as its UTC date', () => {
    expect(formatExpiry('2027-02-01T00:00:00.000Z')).toBe('1 February 2027');
  });
});

describe('parseBudgetInput', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['30', 3000],
    ['$30', 3000],
    ['29.95', 2995],
    ['29.9', 2990],
  ])('parses %j', (input, expected) => {
    expect(parseBudgetInput(input)).toBe(expected);
  });
  it.each(['abc', '-5', '1.234', '1e3'])('rejects %j', input => {
    expect(parseBudgetInput(input)).toBeUndefined();
  });
});
