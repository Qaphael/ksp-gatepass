import {
  Ban,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Clock3,
  CreditCard,
  Info,
  ShieldCheck,
  Ticket,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  EventStatus,
  PaymentStatus,
  SaleStatus,
  ScanResultCode,
  TicketStatus,
} from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

type Domain = "ticket" | "sale" | "payment" | "event" | "scan";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type StatusDefinition = { label: string; icon: LucideIcon; tone: Tone };

const TONE_CLASSES: Record<Tone, string> = {
  success: "border-transparent bg-success text-success-foreground",
  warning: "border-transparent bg-warning text-warning-foreground",
  danger: "border-transparent bg-danger text-danger-foreground",
  info: "border-transparent bg-info text-info-foreground",
  neutral: "border-border bg-muted text-muted-foreground",
};

const DEFINITIONS: Record<Domain, Record<string, StatusDefinition>> = {
  ticket: {
    AVAILABLE: { label: "Available", icon: Ticket, tone: "info" },
    RESERVED: { label: "Reserved", icon: Clock3, tone: "warning" },
    SOLD: { label: "Sold", icon: CheckCircle2, tone: "success" },
    CANCELLED: { label: "Cancelled", icon: Ban, tone: "danger" },
    REVOKED: { label: "Revoked", icon: XCircle, tone: "danger" },
  },
  sale: {
    DRAFT: { label: "Draft", icon: CircleDashed, tone: "neutral" },
    PENDING_PAYMENT: { label: "Pending payment", icon: Clock3, tone: "warning" },
    PARTIALLY_PAID: { label: "Partially paid", icon: CreditCard, tone: "warning" },
    PAID: { label: "Paid", icon: CheckCircle2, tone: "success" },
    CANCELLED: { label: "Cancelled", icon: Ban, tone: "danger" },
    REFUNDED: { label: "Refunded", icon: CreditCard, tone: "info" },
  },
  payment: {
    RECORDED: { label: "Recorded", icon: CheckCircle2, tone: "success" },
    REVERSED: { label: "Reversed", icon: XCircle, tone: "danger" },
    REFUNDED: { label: "Refunded", icon: CreditCard, tone: "info" },
  },
  event: {
    DRAFT: { label: "Draft", icon: CircleDashed, tone: "neutral" },
    SCHEDULED: { label: "Scheduled", icon: CalendarDays, tone: "info" },
    COMPLETED: { label: "Completed", icon: CheckCircle2, tone: "success" },
    ARCHIVED: { label: "Archived", icon: Ban, tone: "neutral" },
  },
  scan: {
    ELIGIBLE: { label: "Eligible", icon: ShieldCheck, tone: "info" },
    ADMITTED: { label: "Admitted", icon: CheckCircle2, tone: "success" },
    INVALID_QR: { label: "Invalid QR", icon: XCircle, tone: "danger" },
    UNKNOWN_SERIAL: { label: "Unknown serial", icon: CircleHelp, tone: "danger" },
    OTHER_EVENT: { label: "Other event", icon: TriangleAlert, tone: "warning" },
    NOT_PAID: { label: "Not fully paid", icon: CreditCard, tone: "warning" },
    TICKET_CANCELLED: { label: "Cancelled", icon: Ban, tone: "danger" },
    TICKET_REVOKED: { label: "Revoked", icon: XCircle, tone: "danger" },
    ALREADY_USED: { label: "Already used", icon: TriangleAlert, tone: "danger" },
    NOT_YET_VALID: { label: "Not yet valid", icon: Clock3, tone: "warning" },
    EXPIRED: { label: "Expired", icon: Clock3, tone: "warning" },
    ADMISSION_CLOSED: { label: "Admission closed", icon: Ban, tone: "warning" },
    TICKET_NOT_SOLD: { label: "Not sold", icon: Ticket, tone: "danger" },
    CATEGORY_NOT_ADMISSIBLE: { label: "Category not admitted", icon: Ticket, tone: "warning" },
  },
};

export function StatusBadge({
  domain,
  status,
  className,
}: {
  domain: Domain;
  status: EventStatus | TicketStatus | SaleStatus | PaymentStatus | ScanResultCode;
  className?: string;
}) {
  const definition = DEFINITIONS[domain][status] ?? {
    label: status.replaceAll("_", " ").toLowerCase(),
    icon: Info,
    tone: "neutral" as const,
  };
  const Icon = definition.icon;

  return (
    <Badge variant="outline" className={cn(TONE_CLASSES[definition.tone], className)}>
      <Icon aria-hidden="true" />
      {definition.label}
    </Badge>
  );
}
