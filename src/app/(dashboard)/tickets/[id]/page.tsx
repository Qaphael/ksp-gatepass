import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Copy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ServiceError } from "@/lib/api";
import { getTicket, getTicketTrace, type TicketDetail } from "@/server/services/tickets.service";
import { getEvent } from "@/server/services/events.service";
import { getActiveTicketTemplatePreview } from "@/server/services/ticket-templates.service";
import { RevokeTicketDialog } from "@/components/tickets/revoke-ticket-dialog";
import { TicketActions } from "@/components/tickets/ticket-actions";
import { TicketPreview } from "@/components/tickets/ticket-preview";
import { TemplateTicketPreview } from "@/components/tickets/template-ticket-preview";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { formatCalendarDate, formatTimestamp } from "@/components/tickets/ticket-format";
import { formatEventTimeRange, formatDateTime } from "@/lib/time";
import { formatUGX } from "@/components/ui/money";
import { ticketTemplateConfigSchema } from "@/lib/validation/ticket-templates";
import { DefList, DefRow } from "@/components/ui/def-list";
import { Timeline } from "@/components/ui/timeline";
import { Money } from "@/components/ui/money";

export const instant = false;

function timelineEntry(
  action: string,
  createdAt: string,
  actorRole: string | null,
): { id: string; time: string; label: string; detail?: string } {
  const labels: Record<string, string> = {
    "sale.create": "Sale created",
    "payment.record": "Payment recorded",
    "payment.reverse": "Payment reversed",
    "payment.refund": "Payment refunded",
    "sale.cancel": "Sale cancelled",
    "sale.refund": "Sale refunded",
    "ticket.print": "Ticket printed",
    "ticket.reprint": "Ticket reprinted",
    "ticket.revoke": "Ticket revoked",
    "ticket.remove": "Ticket removed",
    "sale.ticket.lookup": "Ticket lookup",
  };
  return {
    id: `${action}-${createdAt}`,
    time: formatDateTime(createdAt, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" }),
    label: labels[action] ?? action.replaceAll("_", " "),
    detail: actorRole ? `${actorRole ?? "system"}` : undefined,
  };
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");

  const { id } = await params;
  let ticket: TicketDetail;
  try {
    ticket = await getTicket(ctx, id);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }

  const printable =
    ticket.status !== "REVOKED" && ticket.status !== "CANCELLED";
  const [event, activeTemplate] = printable
    ? await Promise.all([
        getEvent(ctx, ticket.eventId),
        getActiveTicketTemplatePreview(ctx, ticket.eventId, ticket.ticketTypeId),
      ])
    : [null, null];
  const templateConfig = activeTemplate ? ticketTemplateConfigSchema.safeParse(activeTemplate.config) : null;
  const canRevoke =
    can(ctx.role, "ticket:revoke") &&
    (ticket.status === "AVAILABLE" || ticket.status === "RESERVED");

  const trace = await getTicketTrace(ctx, ticket.id);
  const saleRecord = trace.sale;
  const checkIn = trace.checkIn;

  // Merge auditHistory and printHistory into a single timeline, sorted by time.
  const timelineItems = [
    ...ticket.auditHistory.map((row) => timelineEntry(row.action, row.createdAt, row.actorRole)),
    ...ticket.printHistory.map((row) => timelineEntry(row.kind, row.createdAt, row.actorId ?? null)),
  ].sort((a, b) => b.time.localeCompare(a.time));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to inventory
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold">{ticket.serial}</h1>
              <button
                className="rounded-md border border-input bg-card px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                title="Copy serial"
                aria-label="Copy serial"
              >
                <Copy className="size-3.5 shrink-0" aria-hidden="true" />
              </button>
            </div>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.eventName} · {ticket.ticketTypeName}
            {ticket.batchRef ? ` · batch ${ticket.batchRef}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TicketActions
            ticketId={ticket.id}
            serial={ticket.serial}
            canPrint={can(ctx.role, "ticket:print")}
            printable={printable}
            hasPrintHistory={ticket.printHistory.length > 0}
          />
          {saleRecord && ticket.status === "SOLD" ? (
            <Link
              href={`/sales/${saleRecord.id}`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              <ArrowLeft className="size-3 shrink-0" aria-hidden="true" /> Open sale
            </Link>
          ) : null}
          {canRevoke ? (
            <RevokeTicketDialog ticketId={ticket.id} serial={ticket.serial} />
          ) : null}
        </div>
      </div>

      {/* Pass preview */}
      {printable && event ? (
        <Card>
          <CardHeader>
            <CardTitle>Ticket preview</CardTitle>
            <CardDescription>
              The QR and ticket design come from the active template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeTemplate && templateConfig?.success ? (
              <TemplateTicketPreview
                name={activeTemplate.name}
                version={activeTemplate.version}
                artworkUrl={activeTemplate.artworkUrl}
                config={templateConfig.data}
                serial={ticket.serial}
                qrSrc={`/api/v1/tickets/${ticket.id}/qr.png`}
                categoryColor={ticket.ticketTypeColor}
                values={{
                  category: ticket.ticketTypeName,
                  price: formatUGX(ticket.ticketTypePriceUgx),
                  eventName: event.name,
                  eventDate: formatCalendarDate(event.eventDate),
                  eventTime: formatEventTimeRange(event.startTime, event.endTime),
                  venue: event.address ? `${event.venue}, ${event.address}` : event.venue,
                  footerText: event.ticketFooterText ?? "",
                  organiserContact: event.organiserContact ?? "",
                  authNotice: "Valid only after verification at the gate.",
                }}
              />
            ) : (
              <TicketPreview
                serial={ticket.serial}
                categoryName={ticket.ticketTypeName}
                event={{
                  name: event.name,
                  venue: event.venue,
                  address: event.address,
                  eventDate: event.eventDate,
                  startTime: event.startTime,
                  endTime: event.endTime,
                  ticketFooterText: event.ticketFooterText,
                }}
                qrSrc={`/api/v1/tickets/${ticket.id}/qr.png`}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Sale record from getTicketTrace */}
      {saleRecord ? (
        <Card>
          <CardHeader>
            <CardTitle>Sale record</CardTitle>
            <CardDescription>
              The sale this ticket was part of.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Reference</span>
              <Link href={`/sales/${saleRecord.id}`} className="font-mono text-base font-semibold">{saleRecord.reference}</Link>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <span className="font-mono text-base font-semibold">{saleRecord.status.replaceAll("_", " ")}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Seller</span>
              <span className="font-medium">{saleRecord.sellerName}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Customer</span>
              <span className="font-medium">{saleRecord.customerName ?? "Not provided"}</span>
            </div>
            <div className="sm:col-span-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="font-mono text-base font-semibold tabular-nums"><Money amount={saleRecord.totalUgx} /></span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Paid</span>
                <span className="font-mono text-base font-semibold tabular-nums text-success-foreground"><Money amount={saleRecord.paidNetUgx} /></span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Balance</span>
                <span className="font-mono text-base font-semibold tabular-nums text-muted-foreground"><Money amount={saleRecord.balanceUgx} /></span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Gate entry */}
      <Card>
        <CardHeader>
          <CardTitle>Gate entry</CardTitle>
          <CardDescription>
            Admission record for this ticket.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checkIn ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Gate</span>
                <span className="font-medium">{checkIn.gate}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Time</span>
                <span className="font-mono text-base font-semibold">{formatDateTime(checkIn.checkedInAt, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" })} EAT</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Method</span>
                <span className="font-medium">{checkIn.method.replaceAll("_", " ")}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Verifier</span>
                <span className="font-medium">{checkIn.verifierName}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not admitted yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DefList>
            <DefRow label="Status">{ticket.status.replaceAll("_", " ")}</DefRow>
            <DefRow label="Event">{ticket.eventName}</DefRow>
            <DefRow label="Category">{ticket.ticketTypeName}</DefRow>
            <DefRow label="Batch">{ticket.batchRef ?? "—"}</DefRow>
            <DefRow label="Created">{formatTimestamp(ticket.createdAt)}</DefRow>
            <DefRow label="Last updated">{formatTimestamp(ticket.updatedAt)}</DefRow>
            {ticket.revokeReason ? (
              <DefRow label="Revoke reason">
                {ticket.revokeReason}{ticket.revokedById ? ` (by user ${ticket.revokedById.slice(0, 8)}…)` : null}
              </DefRow>
            ) : null}
          </DefList>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>
            Audit events and print activity for this ticket, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline items={timelineItems} emptyText="No events recorded." />
        </CardContent>
      </Card>
    </div>
  );
}
