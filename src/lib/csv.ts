/**
 * CSV export helper with spreadsheet formula-injection protection
 * (AGENTS.md rule: "CSV exports must guard against spreadsheet formula
 * injection").
 *
 * Values that a spreadsheet would interpret as a formula are prefixed with a
 * single quote so they render as text. Fields containing separators, quotes or
 * newlines are quoted per RFC 4180. A UTF-8 BOM is prepended so Excel opens
 * Ugandan venue names and notes correctly.
 */

const NEEDS_QUOTE = /[",\n\r]/;
/** Leading characters spreadsheets treat as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    // Numbers and booleans can never be formulas.
    return String(value);
  }

  let text = value;
  if (FORMULA_START.test(text)) {
    // Neutralise =SUM(...), +cmd, -2+3, @x, tab/CR variants.
    text = `'${text}`;
  }
  if (NEEDS_QUOTE.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/** Builds a complete CSV document (with BOM) from headers and rows. */
export function buildCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>,
): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  // Trailing newline on the last row, BOM for Excel.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
