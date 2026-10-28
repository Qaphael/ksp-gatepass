/** Format an integer amount in Uganda shillings without currency decimals. */
export function formatUGX(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("UGX amounts must be safe integers.");
  }
  return `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function Money({ amount, className }: { amount: number; className?: string }) {
  return <span className={`tabular-nums ${className ?? ""}`.trim()}>{formatUGX(amount)}</span>;
}
