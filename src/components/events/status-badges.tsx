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

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function OpenBadge({ open, label }: { open: boolean; label: string }) {
  return open ? (
    <Badge variant="outline" className="border-transparent bg-info/10 text-info">
      {label} open
    </Badge>
  ) : (
    <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
      {label} closed
    </Badge>
  );
}
