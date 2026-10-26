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
