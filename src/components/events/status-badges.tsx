import { Archive, CalendarClock, Check, CircleCheck, PencilLine, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import type { EventStatus } from "@/generated/prisma/client";

const STATUS_STYLES: Record<EventStatus, string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  SCHEDULED:
    "border-transparent bg-primary/10 text-primary",
  COMPLETED:
    "border-transparent bg-success/10 text-success",
  ARCHIVED: "border-border bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

/** Status is never colour alone: every chip pairs a token colour with an icon and a word. */
const STATUS_ICONS: Record<EventStatus, typeof Archive> = {
  DRAFT: PencilLine,
  SCHEDULED: CalendarClock,
  COMPLETED: CircleCheck,
  ARCHIVED: Archive,
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5", STATUS_STYLES[status])}>
      <Icon aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Sales/admission state chip for an event: icon plus an explicit open/closed
 * word, so the state never depends on colour.
 */
export function StateChip({ open, label }: { open: boolean; label: string }) {
  const Icon = open ? Check : X;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs font-medium",
        open
          ? "border-success/40 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label} {open ? "open" : "closed"}
    </span>
  );
}
