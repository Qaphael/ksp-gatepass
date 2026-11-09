/** Normalize Ugandan mobile numbers to E.164 (+2567XXXXXXXX). */
export function normalizeUgandaPhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, "");
  let national: string;
  if (/^07\d{8}$/.test(compact)) national = compact.slice(1);
  else if (/^\+?2567\d{8}$/.test(compact)) national = compact.replace(/^\+?256/, "");
  else throw new Error("Enter a valid Ugandan mobile number, for example 0772 123 456 or +256 772 123 456.");
  return `+256${national}`;
}
