import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Tickets } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { getBatch } from "@/server/services/ticket-batches.service";
import { getEvent } from "@/server/services/events.service";
import { listTickets } from "@/server/services/tickets.service";
import { BatchPrintActions } from "@/components/tickets/batch-print-actions";
import { TemplateTicketPreview } from "@/components/tickets/template-ticket-preview";
import { formatTimestamp } from "@/components/tickets/ticket-format";
import { formatCalendarDate } from "@/components/tickets/ticket-format";
import { formatEventTimeRange } from "@/lib/time";
import { listTicketTemplates } from "@/server/services/ticket-templates.service";
import { ticketTemplateConfigSchema } from "@/lib/validation/ticket-templates";
import { listTicketTypes } from "@/server/services/ticket-types.service";
import { formatUGX } from "@/components/ui/money";

export const instant = false;

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const [event, firstPage, templates, ticketTypes] = await Promise.all([
    getEvent(ctx, batch.eventId),
    listTickets(ctx, { batchId: batch.id, page: 1, pageSize: 1 }),
    can(ctx.role, "template:manage") ? listTicketTemplates(ctx, batch.eventId) : Promise.resolve([]),
    listTicketTypes(ctx, batch.eventId),
  ]);
  const firstTicket = firstPage.tickets[0];
  const template = templates.find((item) => item.ticketTypeId === batch.ticketTypeId && item.status === "ACTIVE")
    ?? templates.find((item) => item.ticketTypeId === null && item.status === "ACTIVE");
  const templateConfig = template ? ticketTemplateConfigSchema.safeParse(template.config) : null;

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
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {batch.batchRef}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {batch.eventName} · {batch.ticketTypeName} · {batch.quantity}{" "}
            tickets
            {batch.label ? ` · ${batch.label}` : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={`/tickets?batchId=${batch.id}`} />}
        >
          <Tickets /> View tickets in this batch
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Batch summary</CardTitle>
          <CardDescription>
            Created {formatTimestamp(batch.createdAt)}
            {batch.createdById ? ` by user ${batch.createdById.slice(0, 8)}…` : ""}.
            Every print of this batch is recorded and traceable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Serial range</dt>
              <dd className="font-mono font-medium">{batch.serialRange}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Quantity</dt>
              <dd className="font-medium tabular-nums">{batch.quantity}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Category</dt>
              <dd className="font-medium">{batch.ticketTypeName}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {firstTicket && template && templateConfig?.success ? (
        <Card>
          <CardHeader>
            <CardTitle>Active template preview</CardTitle>
            <CardDescription>
              This shows the artwork and fields used for a new print. The PDF
              arranges tickets on the selected paper layout.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TemplateTicketPreview
              name={template.name}
              version={template.version}
              artworkUrl={template.artworkUrl}
              config={templateConfig.data}
              serial={firstTicket.serial}
              qrSrc={`/api/v1/tickets/${firstTicket.id}/qr.png`}
              categoryColor={ticketTypes.find((type) => type.id === batch.ticketTypeId)?.color ?? "#0F3D2E"}
              values={{
                category: batch.ticketTypeName,
                price: formatUGX(ticketTypes.find((type) => type.id === batch.ticketTypeId)?.priceUgx ?? 0),
                eventName: event.name,
                eventDate: formatCalendarDate(event.eventDate),
                eventTime: formatEventTimeRange(event.startTime, event.endTime),
                venue: event.address ? `${event.venue}, ${event.address}` : event.venue,
                footerText: event.ticketFooterText ?? "",
                organiserContact: event.organiserContact ?? "",
                authNotice: "Valid only after verification at the gate.",
              }}
            />
            <BatchPrintActions
              batchId={batch.id}
              eventId={batch.eventId}
              quantity={batch.quantity}
              canPrint={can(ctx.role, "ticket:print")}
              canExport={can(ctx.role, "inventory:export")}
              templateReady={true}
            />
          </CardContent>
        </Card>
      ) : firstTicket ? <Card><CardHeader><CardTitle>Ticket design not active</CardTitle><CardDescription>The generic preview is hidden. Activate a measured template for this event and ticket category before printing this batch.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><BatchPrintActions batchId={batch.id} eventId={batch.eventId} quantity={batch.quantity} canPrint={can(ctx.role, "ticket:print")} canExport={can(ctx.role, "inventory:export")} templateReady={false} />{can(ctx.role, "template:manage") ? <Button variant="outline" nativeButton={false} render={<Link href={`/events/${batch.eventId}/ticket-templates`} />}>Manage ticket templates</Button> : null}</CardContent></Card> : null}
    </div>
  );
}
