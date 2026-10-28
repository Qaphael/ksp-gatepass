import type { ReactNode } from "react";

/** Keeps the compact phone cards and the full desktop table in one responsive list. */
export function ResponsiveList({ cards, table }: { cards: ReactNode; table: ReactNode }) {
  return <>
    <div className="grid gap-3 md:hidden">{cards}</div>
    <div className="hidden min-w-0 md:block">{table}</div>
  </>;
}
