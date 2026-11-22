import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ArrowRight, Search, TicketCheck, Users, Package, CheckCircle, FileDown, AlertCircle } from "lucide-react";
import {
  Card,
} from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ServiceError } from "@/lib/api";
import { getBatch } from "@/server/services/ticket-batches.service";
import { getBatchFlow } from "@/server/services/ticket-batches.service";
import { BatchPrintActions } from "@/components/tickets/batch-print-actions";
import { formatTimestamp } from "@/components/tickets/ticket-format";
import { listTicketTemplates } from "@/server/services/ticket-templates.service";
import { ticketTemplateConfigSchema } from "@/lib/validation/ticket-templates";
import { listTicketTypes } from "@/server/services/ticket-types.service";
import { formatUGX } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { TemplateTicketPreview } from "@/components/tickets/template-ticket-preview";

export const instant = false;

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");

  const { id } = await params;
  let batch;
  try {
    batch = await getBatch(ctx, id);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }

  const [flow, templates, ticketTypes] = await Promise.all([
    getBatchFlow(ctx, batch.id),
    can(ctx.role, "template:manage") ? listTicketTemplates(ctx, batch.eventId) : Promise.resolve([]),
    listTicketTypes(ctx, batch.eventId),
  ]);

  const firstTicketType = ticketTypes.find((type) => type.id === batch.ticketTypeId);
  const grossValue = batch.quantity * (firstTicketType?.priceUgx ?? 0);

  const template = templates.find((item) => item.ticketTypeId === batch.ticketTypeId && item.status === "ACTIVE")
    ?? templates.find((item) => item.ticketTypeId === null && item.status === "ACTIVE");
  const templateConfig = template ? ticketTemplateConfigSchema.safeParse(template.config) : null;
  const canPrint = can(ctx.role, "ticket:print");
  const canExport = can(ctx.role, "inventory:export");

  const pct = (value: number) => flow.total ? Math.round((value / flow.total) * 100) : 0;

  const templateVersion = template?.version ?? 0;
  const templateName = template?.name ?? "No active template";

  // Serial manifest: fetch first 5 tickets with trace
  const ticketsResult = await import("@/server/services/tickets.service").then(m =>
    m.listTickets(ctx, { batchId: batch.id, page: 1, pageSize: 5, include: "trace" })
  );
  const tickets = ticketsResult.tickets;

  // Event details for subline
  const eventName = batch.eventName;
  const event = await import("@/server/services/events.service").then(m => m.getEvent(ctx, batch.eventId));
  const eventDate = event.eventDate;
  const eventVenue = event.venue;

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
      {/* Left column */}
      <div className="flex flex-col gap-4">
        {/* Back row */}
        <Link
          href={`/tickets?eventId=${batch.eventId}`}
          className="inline-flex items-center gap-1 min-h-11 text-[11px] font-mono uppercase tracking-wider text-primary hover:text-primary/80"
        >
          <ArrowLeft className="size-3.5" /> Back to inventory
        </Link>

        {/* Title block */}
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono">{batch.batchRef}</span>
            <h1 className="text-xl font-semibold tracking-tight">{firstTicketType?.name ?? "Unknown ticket type"}</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {eventName} · {eventDate} · {eventVenue}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
              {batch.quantity} tickets
            </span>
            <span className="inline-flex items-center rounded-full bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
              {template ? `Template v${templateVersion} active` : "No active template"}
            </span>
          </div>
        </div>

        {/* Spec Panel */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">BATCH REFERENCE</p>
              <p className="text-base font-mono font-bold tracking-wider">{batch.batchRef}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono">{firstTicketType?.name ?? "Unknown"}</span>
              <span className="text-[13px] font-mono">
                <span className="tabular-nums">{formatUGX(firstTicketType?.priceUgx ?? 0, true)}</span> / ticket
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="rounded-sm bg-muted/40 p-2.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Serial range</p>
              <p className="text-[13px] font-mono font-bold text-primary">{batch.serialRange}</p>
              <p className="text-xs text-muted-foreground">{batch.quantity} tickets</p>
            </div>
            <div className="rounded-sm bg-muted/40 p-2.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Batch value</p>
              <p className="text-[13px] font-mono font-bold text-success tabular-nums">{formatUGX(grossValue)}</p>
              <p className="text-xs text-muted-foreground">Quantity × price</p>
            </div>
          </div>
          {template && templateConfig?.success && (
            <div className="rounded-sm bg-muted/60 p-2.5 gap-1 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">PRINT TEMPLATE</p>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono ${
                  template.calibrationPrintedAt
                    ? "bg-success/10 text-success"
                    : "bg-warning/10 text-warning"
                }`}>
                  {template.calibrationPrintedAt ? "Calibration printed" : "Calibration not printed"}
                </span>
              </div>
              <p className="truncate text-sm">{templateName} (v{templateVersion})</p>
              <p className="text-[11px] font-mono text-muted-foreground">
                Created {template.createdAt ? formatTimestamp(template.createdAt.toISOString()) : "—"}
              </p>
            </div>
          )}
        </Card>

        {/* Template strip */}
        {template && templateConfig?.success && (
          <Card className="p-3 flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-muted flex items-center justify-center">
              <FileDown className="size-4 text-muted-foreground" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-sm font-medium">
                {template.calibrationPrintedAt
                  ? `Calibration sheet printed ${formatTimestamp(template.calibrationPrintedAt.toISOString())}`
                  : "Calibration sheet not printed"}
              </p>
              <p className="text-xs">
                {template.zonesArePlaceholder
                  ? <span className="text-destructive">Print zones are placeholders</span>
                  : (
                    <Link
                      href={`/events/${batch.eventId}/ticket-templates`}
                      className="text-primary hover:underline"
                    >
                      Manage ticket templates
                    </Link>
                  )}
              </p>
            </div>
          </Card>
        )}

        {/* Dispatch */}
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">OPERATIONAL DISPATCH</p>
          <BatchPrintActions
            batchId={batch.id}
            eventId={batch.eventId}
            quantity={batch.quantity}
            canPrint={canPrint}
            canExport={canExport}
            templateReady={Boolean(template && templateConfig?.success && !template.zonesArePlaceholder)}
          />
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4">
        {/* Flow */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">INVENTORY FLOW</p>
            <p className="text-[11px] font-mono text-muted-foreground">{pct(flow.sold)}% sold</p>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <div className="flex items-center justify-between">
                <p className="text-xl font-semibold tabular-nums">{flow.total}</p>
                <CheckCircle className="size-4 text-success" />
              </div>
              <p className="text-[11px] font-mono text-success">100%</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">With sellers</p>
              <div className="flex items-center justify-between">
                <p className="text-xl font-semibold tabular-nums">{flow.withSellers}</p>
                <Users className="size-4 text-warning" />
              </div>
              <p className="text-[11px] font-mono text-warning">{pct(flow.withSellers)}%</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Checked in</p>
              <div className="flex items-center justify-between">
                <p className="text-xl font-semibold tabular-nums">{flow.checkedIn}</p>
                <TicketCheck className="size-4 text-success" />
              </div>
              <p className="text-[11px] font-mono text-success">{pct(flow.checkedIn)}%</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Unissued</p>
              <div className="flex items-center justify-between">
                <p className="text-xl font-semibold tabular-nums">{flow.inVault}</p>
                <Package className="size-4 text-muted-foreground" />
              </div>
              <p className="text-[11px] font-mono text-muted-foreground">{pct(flow.inVault)}%</p>
            </Card>
          </div>
          {/* Stacked bar */}
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden flex" role="img" aria-label={`Inventory flow: ${flow.checkedIn} checked in, ${flow.sold - flow.checkedIn} sold not admitted, ${flow.withSellers} with sellers, ${flow.inVault} unissued, ${flow.revoked + flow.cancelled} other/revoked`}>
            {flow.total > 0 && (
              <>
                {flow.checkedIn > 0 && (
                  <div className="h-full bg-success" style={{ width: `${Math.round((flow.checkedIn / flow.total) * 100)}%` }} />
                )}
                {flow.sold > flow.checkedIn && (
                  <div className="h-full bg-primary" style={{ width: `${Math.round(((flow.sold - flow.checkedIn) / flow.total) * 100)}%` }} />
                )}
                {flow.withSellers > 0 && (
                  <div className="h-full bg-warning" style={{ width: `${Math.round((flow.withSellers / flow.total) * 100)}%` }} />
                )}
                {flow.inVault > 0 && (
                  <div className="h-full bg-muted-foreground/30" style={{ width: `${Math.round((flow.inVault / flow.total) * 100)}%` }} />
                )}
                {flow.revoked + flow.cancelled > 0 && (
                  <div className="h-full bg-danger" style={{ width: `${Math.round(((flow.revoked + flow.cancelled) / flow.total) * 100)}%` }} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Custody */}
        {flow.custody && flow.custody.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">CUSTODY</p>
              <p className="text-[11px] font-mono text-muted-foreground">{flow.custody.length} sellers</p>
            </div>
            <div className="space-y-2">
              {flow.custody.map((c) => (
                <Card key={c.sellerId} className="p-3 flex items-center gap-3">
                  <div className="size-7 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                    {c.sellerName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                  <p className="text-base font-semibold truncate">{c.sellerName}</p>
                  <span className="ml-auto inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono">
                    {c.sold} of {c.held + c.sold} sold
                  </span>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Serial manifest */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">SERIAL MANIFEST</p>
            <Link
              href={`/tickets?batchId=${batch.id}&eventId=${batch.eventId}`}
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <form action="/tickets" method="GET" className="mb-3">
            <input type="hidden" name="batchId" value={batch.id} />
            <input type="hidden" name="eventId" value={batch.eventId} />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search within batch, e.g. KSP-00001"
                className="h-12 pl-10 text-sm"
              />
            </div>
          </form>
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="relative size-10 flex-shrink-0">
                  <div
                    className="absolute left-1 top-1/2 -translate-y-1/2 size-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        ticket.status === "SOLD" ? "var(--success)" :
                        ticket.status === "AVAILABLE" ? "var(--info)" :
                        ticket.trace?.checkedInAt ? "var(--success)" :
                        ticket.status === "REVOKED" || ticket.status === "CANCELLED" ? "var(--danger)" :
                        "var(--muted-foreground)",
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-mono font-bold truncate">{ticket.serial}</span>
                    {ticket.trace?.checkedInAt && (
                      <StatusBadge domain="scan" status="ADMITTED" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {ticket.trace?.customerName ?? "—"} · {ticket.trace?.saleReference ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <span className="tabular-nums text-sm font-medium">
                    {formatUGX(ticket.ticketTypePriceUgx)}
                  </span>
                  <StatusBadge domain="ticket" status={ticket.status} />
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
            {tickets.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No tickets in this batch.</p>
            )}
          </div>
        </div>
      </div>

      {/* Template preview - full width below both columns */}
      {template && templateConfig?.success && (
        <div className="lg:col-span-2">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer p-3 rounded-lg border bg-card">
              <span className="font-medium">Template preview</span>
              <span className="text-xs text-muted-foreground">Click to expand</span>
            </summary>
            <div className="p-3 pt-0">
              <TemplateTicketPreview
                name={template.name}
                version={template.version}
                artworkUrl={template.artworkUrl}
                config={templateConfig.data}
                serial={batch.serialRange.split(" … ")[0]}
                qrSrc={`/api/v1/tickets/qr/${batch.serialRange.split(" … ")[0]}`}
                categoryColor={firstTicketType?.color ?? "#0F3D2E"}
                values={{
                  category: firstTicketType?.name ?? "",
                  price: formatUGX(firstTicketType?.priceUgx ?? 0),
                  eventName: batch.eventName,
                  eventDate: eventDate,
                  eventTime: event.startTime,
                  venue: eventVenue,
                  footerText: event.ticketFooterText ?? "",
                  organiserContact: event.organiserContact ?? "",
                  authNotice: "",
                }}
              />
            </div>
          </details>
        </div>
      )}
      {!template || !templateConfig?.success ? (
        <div className="lg:col-span-2">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer p-3 rounded-lg border bg-card">
              <span className="font-medium">Template preview</span>
              <span className="text-xs text-muted-foreground">Click to expand</span>
            </summary>
            <div className="p-3 pt-0 text-center text-muted-foreground">
              <AlertCircle className="size-8 mx-auto mb-2 text-muted-foreground/50" />
              <p>No active template for this ticket type.</p>
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}