import { Badge } from "@/components/ui/badge";
import type { TicketStatus } from "@/generated/prisma/client";

/** Inventory status badge — deliberately distinct from sale/admission state. */
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const variant =
    status === "AVAILABLE"
      ? "secondary"
      : status === "SOLD"
        ? "default"
        : status === "REVOKED"
          ? "destructive"
          : "outline";
  const label =
    status === "AVAILABLE"
      ? "Available"
      : status === "RESERVED"
        ? "Reserved"
        : status === "SOLD"
          ? "Sold"
          : status === "CANCELLED"
            ? "Cancelled"
            : "Revoked";
  return <Badge variant={variant}>{label}</Badge>;
}
