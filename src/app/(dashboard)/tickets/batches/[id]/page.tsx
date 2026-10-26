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
import { TicketPreview } from "@/components/tickets/ticket-preview";
import { formatTimestamp } from "@/components/tickets/ticket-format";

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

  const [event, firstPage] = await Promise.all([
    getEvent(ctx, batch.eventId),
    listTickets(ctx, { batchId: batch.id, page: 1, pageSize: 1 }),
  ]);
  const firstTicket = firstPage.tickets[0];

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

      {firstTicket ? (
        <Card>
          <CardHeader>
            <CardTitle>Ticket preview</CardTitle>
            <CardDescription>
              Shown at ~50% of the printed 210 × 59 mm. The QR below is the real
              code for {firstTicket.serial}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TicketPreview
              serial={firstTicket.serial}
              categoryName={batch.ticketTypeName}
              event={{
                name: event.name,
                venue: event.venue,
                address: event.address,
                eventDate: event.eventDate,
                startTime: event.startTime,
                endTime: event.endTime,
                ticketFooterText: event.ticketFooterText,
              }}
              qrSrc={`/api/v1/tickets/${firstTicket.id}/qr.png`}
            />
            <BatchPrintActions
              batchId={batch.id}
              eventId={batch.eventId}
              quantity={batch.quantity}
              canPrint={can(ctx.role, "ticket:print")}
              canExport={can(ctx.role, "inventory:export")}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
