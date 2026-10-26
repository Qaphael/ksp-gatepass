import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EventActions } from "@/components/events/event-actions";
import { EventForm } from "@/components/events/event-form";
import { OpenBadge, StatusBadge } from "@/components/events/status-badges";
import { TicketTypeManager } from "@/components/events/ticket-type-manager";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import {
  getEvent,
  type EventDto,
} from "@/server/services/events.service";
import { listTicketTypes } from "@/server/services/ticket-types.service";
import { ServiceError } from "@/lib/api";

export const instant = false;

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "event:read")) redirect("/dashboard");

  const { id } = await params;
  let event: EventDto;
  try {
    event = await getEvent(ctx, id);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }
  const ticketTypes = await listTicketTypes(ctx, id);

  const eventEditable = event.status !== "COMPLETED" && event.status !== "ARCHIVED";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to events
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
            <StatusBadge status={event.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.eventDate} · {event.startTime}–{event.endTime} ·{" "}
            {event.venue}
            {event.address ? `, ${event.address}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <OpenBadge open={event.salesOpen} label="Sales" />
            <OpenBadge open={event.admissionOpen} label="Admission" />
          </div>
        </div>
        {can(ctx.role, "event:update") && eventEditable ? (
          <Button variant="outline" size="sm">
            <Pencil /> Edit details below
          </Button>
        ) : null}
      </div>

      <EventActions
        event={event}
        permissions={{
          openSales: can(ctx.role, "event:open-sales"),
          closeSales: can(ctx.role, "event:close-sales"),
          openAdmission: can(ctx.role, "event:open-admission"),
          closeAdmission: can(ctx.role, "event:close-admission"),
          complete: can(ctx.role, "event:complete"),
          archive: can(ctx.role, "event:archive"),
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Capacity</CardTitle>
          <CardDescription>
            {event.allocatedCapacity} of {event.capacity} tickets allocated across{" "}
            {event.ticketTypeCount}{" "}
            {event.ticketTypeCount === 1 ? "category" : "categories"} · admission
            policy:{" "}
            {event.admissionPolicy === "FULL_PAYMENT"
              ? "full payment required"
              : event.admissionPolicy}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Timezone" value={event.timezone} />
            <Detail
              label="Sales window"
              value={
                event.salesOpensAtLocal && event.salesClosesAtLocal
                  ? `${event.salesOpensAtLocal} → ${event.salesClosesAtLocal}`
                  : "Not set"
              }
            />
            <Detail
              label="Admission window"
              value={
                event.admissionOpensAtLocal && event.admissionClosesAtLocal
                  ? `${event.admissionOpensAtLocal} → ${event.admissionClosesAtLocal}`
                  : "Not set"
              }
            />
            <Detail label="Organiser contact" value={event.organiserContact ?? "—"} />
            <Detail label="Accent colour" value={event.accentColor ?? "—"} />
            <Detail
              label="Ticket footer"
              value={event.ticketFooterText ?? "—"}
            />
          </dl>
        </CardContent>
      </Card>

      <TicketTypeManager
        eventId={event.id}
        canManage={can(ctx.role, "ticket-type:manage")}
        eventEditable={eventEditable}
        ticketTypes={ticketTypes}
      />

      {can(ctx.role, "event:update") && eventEditable ? (
        <section>
          <h2 className="mb-3 text-lg font-medium">Edit event</h2>
          <EventForm mode="edit" event={event} />
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {eventEditable
            ? "You do not have permission to edit event details."
            : "Completed or archived events are read-only. Every change to an active event is recorded in the audit log."}
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
