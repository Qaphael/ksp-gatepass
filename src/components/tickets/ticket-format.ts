/** Display formatting for the tickets area (Africa/Kampala, per PRD 12). */

const FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Kampala",
});

/** ISO timestamp → `5 Dec 2026, 18:30` (Africa/Kampala). */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : FORMATTER.format(date);
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Calendar date `YYYY-MM-DD` → `Sat, 5 Dec 2026`. */
export function formatCalendarDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : DATE_FORMATTER.format(date);
}
