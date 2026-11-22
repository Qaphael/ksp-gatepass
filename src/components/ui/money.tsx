/** Format an integer amount in Uganda shillings without currency decimals. */
export function formatUGX(amount: number, bare = false): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("UGX amounts must be safe integers.");
  }
  const formatted = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(amount);
  return bare ? formatted : `UGX ${formatted}`;
}

export function Money({ amount, bare = false, className }: { amount: number; bare?: boolean; className?: string }) {
  return <span className={`tabular-nums ${className ?? ""}`.trim()}>{formatUGX(amount, bare)}</span>;
}
