export const LIMITS = {
  minParticipants: 2,
  participants: 100,
  name: 80,
  hint: 300,
  message: 2000,
  wishlist: 1000,
  email: 254,
  bodyBytes: 64 * 1024,
  budgetMaxCents: 10_000_000,
} as const;

// Deliberately loose: Resend does the real validation, this rejects obvious junk.
export const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const CURRENCIES = ['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD'] as const;
