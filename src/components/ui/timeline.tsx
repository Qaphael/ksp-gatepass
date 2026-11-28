import type { ReactNode } from "react";
import {
  Timeline as TimelineRoot,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";

type TimelineEntry = {
  /** Unique key for the entry. */
  id: string;
  /** Optional formatted timestamp. */
  time?: string;
  /** Primary label (the action or headline). */
  label: string;
  /** Optional supporting detail. */
  detail?: ReactNode;
};

/** An ordered ReUI timeline. Every entry is a completed step. */
export function Timeline({
  items,
  emptyText = "No timeline events.",
}: {
  items: TimelineEntry[];
  emptyText?: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <TimelineRoot value={items.length}>
      {items.map((item, index) => (
        <TimelineItem key={item.id} step={index + 1}>
          <TimelineHeader>
            {item.time ? <TimelineDate>{item.time}</TimelineDate> : null}
            <TimelineTitle>{item.label}</TimelineTitle>
          </TimelineHeader>
          <TimelineIndicator />
          <TimelineSeparator />
          {item.detail !== undefined ? (
            <TimelineContent>{item.detail}</TimelineContent>
          ) : null}
        </TimelineItem>
      ))}
    </TimelineRoot>
  );
}
