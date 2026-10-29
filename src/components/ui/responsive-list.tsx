import type { ReactNode } from "react";

/** Keeps the compact phone cards and the full desktop table in one responsive list. */
export function ResponsiveList({
  cards,
  table,
  cardsUntil = "md",
}: {
  cards: ReactNode;
  table: ReactNode;
  cardsUntil?: "md" | "lg";
}) {
  const cardVisibility = cardsUntil === "lg" ? "lg:hidden" : "md:hidden";
  const tableVisibility = cardsUntil === "lg" ? "hidden lg:block" : "hidden md:block";
  return <>
    <div className={`grid min-w-0 gap-3 ${cardVisibility}`}>{cards}</div>
    <div className={`min-w-0 ${tableVisibility}`}>{table}</div>
  </>;
}
