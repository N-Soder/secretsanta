const DAY_MS = 86_400_000;
const MIN_DAYS_AFTER = 14;

// Groups are wiped on the first 1 February (00:00 UTC) at least 14 days after
// the later of the creation date and the event date.
export function computeExpiresAt(createdAt: Date, eventDate: string | null): string {
  const created = createdAt.getTime();
  const event = eventDate ? Date.parse(`${eventDate}T00:00:00Z`) : -Infinity;
  const earliest = Math.max(created, event) + MIN_DAYS_AFTER * DAY_MS;

  const year = new Date(earliest).getUTCFullYear();
  const candidate = Date.UTC(year, 1, 1);
  return new Date(candidate >= earliest ? candidate : Date.UTC(year + 1, 1, 1)).toISOString();
}
