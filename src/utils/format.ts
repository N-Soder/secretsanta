// Display helpers shared by the app and the email templates. Australian English throughout.

export function formatBudget(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

// Event dates are calendar dates ('YYYY-MM-DD'), so format them in UTC to avoid
// shifting the day in the viewer's timezone.
export function formatEventDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatExpiry(isoInstant: string): string {
  return formatEventDate(isoInstant.slice(0, 10));
}

// Returns cents, null for an empty field, or undefined when the text isn't a valid amount.
export function parseBudgetInput(text: string): number | null | undefined {
  const value = text.trim().replace(/^\$/, '');
  if (value === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return undefined;
  return Math.round(parseFloat(value) * 100);
}
