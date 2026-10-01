import { describe, expect, it } from 'vitest';
import { computeExpiresAt } from '../../functions/_shared/expiry';

const at = (iso: string) => new Date(iso);

describe('computeExpiresAt', () => {
  it.each([
    ['2026-10-01T03:00:00Z', null, '2027-02-01T00:00:00.000Z'],
    ['2026-10-01T03:00:00Z', '2026-12-20', '2027-02-01T00:00:00.000Z'],
    ['2027-01-20T03:00:00Z', null, '2028-02-01T00:00:00.000Z'],
    ['2026-11-01T00:00:00Z', '2027-01-10', '2027-02-01T00:00:00.000Z'],
    ['2026-11-01T00:00:00Z', '2027-01-25', '2028-02-01T00:00:00.000Z'],
    ['2026-11-01T00:00:00Z', '2027-01-18', '2027-02-01T00:00:00.000Z'], // exactly 14 days
    ['2027-03-01T00:00:00Z', '2027-06-30', '2028-02-01T00:00:00.000Z'], // mid-year swap
  ])('created %s, event %s → %s', (created, event, expected) => {
    expect(computeExpiresAt(at(created), event)).toBe(expected);
  });
});
