import type { ReactNode } from "react";

type TimelineItem = {
  /** Unique key for the entry. */
  id: string;
  /** Optional formatted timestamp (rendered in font-mono). */
  time?: string;
  /** Primary label (the action or headline). */
  label: string;
  /** Optional supporting detail. */
  detail?: ReactNode;
};

/**
 * An ordered, left-ruled timeline. Each entry shows an optional mono timestamp,
 * a primary label and an optional detail line.
 */
export function Timeline({
  items,
  emptyText = "No timeline events.",
}: {
  items: TimelineItem[];
  emptyText?: string;
}) {
  if (!items.length) {
    return <p className="text-base text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="border-l-2 border-border pl-3">
          {item.time && <p className="font-mono text-xs text-muted-foreground">{item.time}</p>}
          <p className="text-base font-medium">{item.label}</p>
          {item.detail !== undefined && <div className="mt-0.5 text-base text-muted-foreground">{item.detail}</div>}
        </li>
      ))}
    </ol>
  );
}