/**
 * Dependency-free timezone helpers. Event windows are entered as wall-clock
 * time in the event's IANA timezone and stored as UTC instants.
 */

const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Earlier end clock times mean the event finishes on the following day. */
export function formatEventTimeRange(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}${endTime < startTime ? " (+1 day)" : ""}`;
}

export function isLocalDateTime(value: string): boolean {
  if (!LOCAL_DATETIME_RE.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/** Throws RangeError for an unknown IANA timezone. */
export function assertTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone });
}

function offsetMsAt(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - utcMs;
}

/**
 * Interpret a naive local datetime ("YYYY-MM-DDTHH:mm") in `timeZone` and
 * return the corresponding UTC Date. Two passes handle offsets that change
 * between the guessed and actual instant.
 */
export function localToUtc(local: string, timeZone: string): Date {
  if (!isLocalDateTime(local)) {
    throw new RangeError("Invalid local datetime");
  }
  assertTimeZone(timeZone);
  const guess = Date.parse(`${local}:00Z`);
  const first = guess - offsetMsAt(guess, timeZone);
  return new Date(guess - offsetMsAt(first, timeZone));
}

/** Format a UTC instant as "YYYY-MM-DDTHH:mm" wall-clock time in a timezone. */
export function utcToLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
