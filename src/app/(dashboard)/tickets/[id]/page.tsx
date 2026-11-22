import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ArrowRight, DoorOpen, Shield, Ticket } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
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
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCalendarDate, formatTimestamp } from "@/components/tickets/ticket-format";
import { formatEventTimeRange, formatDateTime } from "@/lib/time";
import { formatUGX } from "@/components/ui/money";
import { ticketTemplateConfigSchema } from "@/lib/validation/ticket-templates";
import { DefList, DefRow } from "@/components/ui/def-list";
import { Timeline } from "@/components/ui/timeline";
import { Money } from "@/components/ui/money";
import { Chip } from "@/components/ui/chip";
import { CopyButton } from "@/components/ui/copy-button";
import { PanelHeader } from "@/components/ui/panel-header";

export const instant = false;

function timelineEntry(
  action: string,
  createdAt: string,
  actorRole: string | null,
): { id: string; time: string; label: string; detail?: string; tone?: "success" | "warning" | "destructive" | "info" | "neutral" } {
  const labels: Record<string, string> = {
    "sale.create": "Sale created",
    "payment.record": "Payment recorded",
    "payment.reverse": "Payment reversed",
    "payment.refund": "Payment refunded",
    "sale.cancel": "Sale cancelled",
    "sale.refund": "Sale refunded",
    "ticket.print": "Printed",
    "ticket.reprint": "Reprinted",
    "ticket.revoke": "Revoked",
    "ticket.remove": "Removed",
    "sale.ticket.lookup": "Ticket lookup",
  };
  const tones: Record<string, "success" | "warning" | "destructive" | "info" | "neutral"> = {
    "sale.create": "info",
    "payment.record": "info",
    "payment.reverse": "warning",
    "payment.refund": "warning",
    "sale.cancel": "destructive",
    "sale.refund": "destructive",
    "ticket.print": "info",
    "ticket.reprint": "info",
    "ticket.revoke": "destructive",
    "ticket.remove": "destructive",
    "sale.ticket.lookup": "neutral",
    "gate.entry": "success",
    "check_in": "success",
  };
  return {
    id: `${action}-${createdAt}`,
    time: formatDateTime(createdAt, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" }),
    label: labels[action] ?? action.replaceAll("_", " "),
    detail: actorRole ? `${actorRole ?? "system"}` : undefined,
    tone: tones[action] ?? "neutral",
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

  // Build merged timeline from auditHistory, printHistory, trace.sale, trace.checkIn
  const timelineItems = [
    ...ticket.auditHistory.map((row) => timelineEntry(row.action, row.createdAt, row.actorRole)),
    ...ticket.printHistory.map((row) => timelineEntry(row.kind, row.createdAt, null)),
    ...(saleRecord ? [{ id: `sale-${saleRecord.createdAt}`, time: formatDateTime(saleRecord.createdAt, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" }), label: "Sale recorded", detail: saleRecord.sellerName, tone: "info" as const }] : []),
    ...(checkIn ? [{ id: `checkin-${checkIn.checkedInAt}`, time: formatDateTime(checkIn.checkedInAt, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" }), label: "Gate entry granted", detail: checkIn.verifierName, tone: "success" as const }] : []),
  ].sort((a, b) => b.time.localeCompare(a.time));

  const isAdmitted = !!checkIn;

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-6">
      {/* Left column on desktop, top on mobile */}
      <div className="flex flex-col gap-4 lg:col-span-1">
        {/* Back row */}
        <Link
          href="/tickets"
          className="inline-flex items-center gap-1.5 min-h-11 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5 shrink-0" /> Back to inventory
        </Link>
        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Ticket <span className="font-mono">{ticket.serial}</span>
            </h1>
            <CopyButton value={ticket.serial} aria-label="Copy serial" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge domain="ticket" status={ticket.status} />
            {isAdmitted ? (
              <Chip tone="success">Admitted</Chip>
            ) : saleRecord ? (
              <Chip tone="neutral">Not admitted</Chip>
            ) : (
              <Chip tone="neutral">Unassigned</Chip>
            )}
          </div>
        </div>

        {/* Event/category line */}
        <p className="text-sm text-muted-foreground">
          {ticket.eventName} · {ticket.ticketTypeName}
          {ticket.batchRef ? ` · batch ${ticket.batchRef}` : ""}
        </p>

        {/* Action grid */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <TicketActions
            ticketId={ticket.id}
            serial={ticket.serial}
            canPrint={can(ctx.role, "ticket:print")}
            printable={printable}
            hasPrintHistory={ticket.printHistory.length > 0}
          />
          {ticket.batchId ? (
            <Link
              href={`/tickets/batches/${ticket.batchId}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <ArrowRight className="size-3.5 shrink-0" />
              Open batch
            </Link>
          ) : null}
          {canRevoke ? (
            <RevokeTicketDialog ticketId={ticket.id} serial={ticket.serial} />
          ) : null}
        </div>

        {/* Sold tickets cannot be revoked here message */}
        {saleRecord && ticket.status === "SOLD" && (
          <p className="text-xs text-muted-foreground">
            Sold tickets cannot be revoked here. Cancel the sale instead.
            <Link href={`/sales/${saleRecord.id}`} className="ml-1 underline hover:text-foreground">
              Open sale
            </Link>
          </p>
        )}

        {/* Pass preview Panel */}
        {printable && event && (
          <Card className="p-0 overflow-hidden">
            <CardHeader className="p-4 pb-2">
              <PanelHeader icon={<Ticket className="size-5" />} title="Pass preview" />
            </CardHeader>
            <CardContent className="p-4">
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
              {/* Serial row with CopyButton */}
              <div className="mt-4 flex items-center justify-between gap-2 pt-4 border-t">
                <span className="font-mono text-base tracking-wider">{ticket.serial}</span>
                <CopyButton value={ticket.serial} aria-label="Copy serial" />
              </div>
              {/* Bottom info grid */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-left">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Guest</span>
                  <p className="mt-0.5 text-base font-medium">{saleRecord?.customerName ?? "Unassigned"}</p>
                </div>
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Gate opening</span>
                  <p className="mt-0.5 text-base font-medium">
                    {event ? formatDateTime(`${event.eventDate}T${event.startTime}`, "Africa/Kampala", "en-UG", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right column on desktop, below on mobile */}
      <div className="flex flex-col gap-4 lg:col-span-1">
        {/* Sale record Panel */}
        {saleRecord && (
          <Card>
            <CardHeader className="p-4 pb-2">
              <PanelHeader title="Sale record">
                <StatusBadge domain="sale" status={saleRecord.status} />
              </PanelHeader>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 p-4">
              <div className="rounded-sm bg-muted/40 p-2.5">
                <span className="font-mono text-[11px] uppercase text-muted-foreground block">Category</span>
                <span className="text-base font-semibold">{ticket.ticketTypeName}</span>
              </div>
              <div className="rounded-sm bg-muted/40 p-2.5">
                <span className="font-mono text-[11px] uppercase text-muted-foreground block">Paid</span>
                <span className="text-base font-semibold text-primary"><Money amount={saleRecord.paidNetUgx} /></span>
              </div>
              <div className="rounded-sm bg-muted/40 p-2.5">
                <span className="font-mono text-[11px] uppercase text-muted-foreground block">Sale reference</span>
                <Link href={`/sales/${saleRecord.id}`} className="font-mono text-base font-semibold text-primary hover:underline flex items-center gap-1">
                  {saleRecord.reference}
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <div className="rounded-sm bg-muted/40 p-2.5">
                <span className="font-mono text-[11px] uppercase text-muted-foreground block">Seller</span>
                <span className="text-base font-medium">{saleRecord.sellerName}</span>
              </div>
              <div className="col-span-2 space-y-1.5">
                <div className="flex justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">Balance</span>
                  <span className="font-mono text-base font-semibold text-muted-foreground"><Money amount={saleRecord.balanceUgx} /></span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">Purchased</span>
                  <span className="font-mono text-base font-semibold text-muted-foreground">{formatDateTime(saleRecord.createdAt, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" })} EAT</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!saleRecord && (
          <Card>
            <CardHeader className="p-4 pb-2">
              <PanelHeader title="Sale record" />
            </CardHeader>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Not sold yet.</p>
            </CardContent>
          </Card>
        )}

        {/* Gate entry Panel */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <PanelHeader
              icon={<DoorOpen className="size-5 text-success" />}
              title="Gate entry"
            >
              {isAdmitted ? <Chip tone="success">Admitted</Chip> : null}
            </PanelHeader>
          </CardHeader>
          <CardContent className="p-4">
            {checkIn ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-muted/40 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-[11px] uppercase text-muted-foreground block">Gate</span>
                      <span className="text-base font-semibold">{checkIn.gate}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-[11px] uppercase text-muted-foreground block">Verifier</span>
                      <span className="text-base font-semibold">{checkIn.verifierName}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-mono text-[11px] text-muted-foreground">Admitted at</span>
                      <span className="font-mono text-base font-semibold">{formatDateTime(checkIn.checkedInAt, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" })} EAT</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-mono text-[11px] text-muted-foreground">Method</span>
                      <span className="font-mono text-base font-semibold">{checkIn.method === "QR" ? "QR scan" : "Manual serial entry"}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not admitted yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Ticket history Panel */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <PanelHeader title="Ticket history">
              <span className="font-mono text-[11px] text-muted-foreground">{timelineItems.length} events</span>
            </PanelHeader>
          </CardHeader>
          <CardContent className="p-4">
            <Timeline
              items={timelineItems.map((item) => ({
                ...item,
                detail: item.detail ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <span className="font-mono text-xs text-muted-foreground">{item.detail}</span>
                    {item.tone && <Chip tone={item.tone} className="ml-1 h-5 px-1.5 text-[10px]">{item.tone}</Chip>}
                  </span>
                ) : item.tone ? (
                  <Chip tone={item.tone} className="h-5 px-1.5 text-[10px]">{item.tone}</Chip>
                ) : undefined,
              }))}
              emptyText="No events recorded."
            />
          </CardContent>
        </Card>

        {/* Notice Panel - only when admitted */}
        {isAdmitted && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Shield className="size-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-semibold text-destructive">Already admitted</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    A second scan of this ticket is rejected by the server as already used.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Details Panel */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <PanelHeader title="Details" />
          </CardHeader>
          <CardContent className="p-4">
            <DefList>
              <DefRow label="Status">{ticket.status.replaceAll("_", " ")}</DefRow>
              <DefRow label="Event">{ticket.eventName}</DefRow>
              <DefRow label="Category">{ticket.ticketTypeName}</DefRow>
              <DefRow label="Batch">
                {ticket.batchRef ? (
                  <Link href={`/tickets/batches/${ticket.batchId}`} className="text-primary hover:underline font-mono">
                    {ticket.batchRef}
                  </Link>
                ) : (
                  "—"
                )}
              </DefRow>
              <DefRow label="Created">{formatTimestamp(ticket.createdAt)}</DefRow>
              <DefRow label="Last updated">{formatTimestamp(ticket.updatedAt)}</DefRow>
              {ticket.revokeReason ? (
                <DefRow label="Revoke reason">
                  {ticket.revokeReason}
                  {ticket.revokedById && (
                    <span className="text-muted-foreground ml-2">(by {ticket.revokedById.slice(0, 8)}…)</span>
                  )}
                </DefRow>
              ) : null}
            </DefList>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}