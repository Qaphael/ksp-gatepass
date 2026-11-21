/**
 * Human-readable serial numbers (PRD 5.5 / 16).
 *
 * Format: `PREFIX-00001`. The prefix is configurable per batch; the padded
 * width is a fixed default (5 digits) and grows automatically for larger
 * numbers. Serials are globally unique — enforced by the database, not here.
 */

export const SERIAL_PREFIX_RE = /^[A-Z0-9][A-Z0-9-]{0,11}$/;
export const SERIAL_PREFIX_DEFAULT = "KSP";
const PAD_WIDTH = 5;
/** Upper bound so serials stay scannable and printable. */
export const SERIAL_NUMBER_MAX = 999_999_999;

/** Formats `("KSP", 1)` → `"KSP-00001"`. */
export function formatSerial(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(PAD_WIDTH, "0")}`;
}

/** True when `value` looks like a serial produced by {@link formatSerial}. */
export function isSerialFormat(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{0,11}-\d{5,9}$/.test(value);
}

export interface SerialRange {
  prefix: string;
  from: number;
  to: number;
}

/**
 * Parses an inclusive range typed by a human. `KSP-1` … `KSP-500` and
 * `KSP-00001` … `KSP-00500` describe the same numeric range, so the padding an
 * operator happens to type never changes the tickets that get selected.
 */
export function parseSerialRange(serialFrom: string, serialTo: string): SerialRange | null {
  const from = parseSerialNumber(serialFrom);
  const to = parseSerialNumber(serialTo);
  if (!from || !to || from.prefix !== to.prefix || from.number > to.number) return null;
  return { prefix: from.prefix, from: from.number, to: to.number };
}

/** Canonical serials for an inclusive range, using the shared padding rule. */
export function expandSerialRange(range: SerialRange): string[] {
  const serials: string[] = [];
  for (let number = range.from; number <= range.to; number += 1) serials.push(formatSerial(range.prefix, number));
  return serials;
}

/** One parsed serial: prefix + numeric part. */
interface SerialRow {
  value: string;
  prefix: string;
  number: number;
}

/**
 * Compresses serials into inclusive human-readable ranges: consecutive numbers
 * of one prefix become `PREFIX-00001-PREFIX-00005`, singletons stay `PREFIX-00007`.
 */
export function compressSerialRanges(serials: string[]): string[] {
  const rows: SerialRow[] = [];
  for (const raw of serials) {
    const value = raw.trim().toUpperCase();
    const match = /^([A-Z0-9][A-Z0-9-]{0,11})-(\d{1,9})$/.exec(value);
    if (!match) continue;
    rows.push({ value, prefix: match[1], number: Number(match[2]) });
  }
  rows.sort((a, b) => (a.prefix === b.prefix ? a.number - b.number : a.prefix < b.prefix ? -1 : 1));
  const ranges: Array<{ prefix: string; from: number; to: number }> = [];
  let run: { prefix: string; from: number; to: number } | null = null;
  for (const row of rows) {
    if (run && run.prefix === row.prefix && row.number === run.to + 1) {
      run = { prefix: run.prefix, from: run.from, to: row.number };
      continue;
    }
    if (run) ranges.push(run);
    run = { prefix: row.prefix, from: row.number, to: row.number };
  }
  if (run) ranges.push(run);
  return ranges.map((range) =>
    range.from === range.to
      ? `${range.prefix}-${String(range.from).padStart(PAD_WIDTH, "0")}`
      : `${range.prefix}-${String(range.from).padStart(PAD_WIDTH, "0")}-${range.prefix}-${String(range.to).padStart(PAD_WIDTH, "0")}`,
  );
}

function parseSerialNumber(value: string): { prefix: string; number: number } | null {
  // The prefix may itself contain dashes, so split on the last dash.
  const match = /^([A-Z0-9][A-Z0-9-]{0,11})-(\d{1,9})$/.exec(value.trim().toUpperCase());
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number > SERIAL_NUMBER_MAX) return null;
  return { prefix: match[1], number };
}
