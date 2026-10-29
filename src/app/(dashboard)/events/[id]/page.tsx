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
import { EventPoster } from "@/components/events/event-poster";
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
import { getTicketTypeProgress } from "@/server/services/dashboard.service";
import { ServiceError } from "@/lib/api";
import { formatEventTimeRange } from "@/lib/time";

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
  const [ticketTypes, ticketProgress] = await Promise.all([
    listTicketTypes(ctx, id),
    getTicketTypeProgress(ctx, id),
  ]);

  const eventEditable = event.status !== "COMPLETED" && event.status !== "ARCHIVED";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to events
      </Link>

      <div className={`grid items-start gap-5 ${event.branding.poster ? "md:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
            <StatusBadge status={event.status} />
          </div>
          {event.status === "DRAFT" && can(ctx.role, "event:update") ? (
            <div className="mt-3">
              <EventActions
                event={event}
                permissions={{ publish: true, openSales: false, closeSales: false, openAdmission: false, closeAdmission: false, complete: false, archive: false }}
              />
            </div>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">
            {event.eventDate} · {formatEventTimeRange(event.startTime, event.endTime)} ·{" "}
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
        {event.branding.poster && <aside className="min-w-0">
          <EventPoster poster={event.branding.poster} variant="display" className="max-h-[70dvh] md:hidden" />
          <EventPoster poster={event.branding.poster} variant="banner" className="hidden md:block" />
          <a href={`${event.branding.poster.displayUrl}&download=1`} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">Download poster</a>
        </aside>}
      </div>

      <section aria-labelledby="event-controls-heading" className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="event-controls-heading" className="mb-3 text-base font-semibold">Sales and admission controls</h2>
        <EventActions
          event={event}
          permissions={{
          publish: false,
          openSales: can(ctx.role, "event:open-sales"),
          closeSales: can(ctx.role, "event:close-sales"),
          openAdmission: can(ctx.role, "event:open-admission"),
          closeAdmission: can(ctx.role, "event:close-admission"),
          complete: can(ctx.role, "event:complete"),
          archive: can(ctx.role, "event:archive"),
          }}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ticket availability</CardTitle>
          <CardDescription>Tickets sold and remaining by category.</CardDescription>
        </CardHeader>
        <CardContent>
          {ticketProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ticket categories are configured yet.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {ticketProgress.map((type) => {
                const total = Math.max(type.total, 1);
                return (
                  <li key={type.id} className="rounded-xl border p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="truncate font-medium">{type.name}</h3>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{type.sold} sold · {type.remaining} remaining</span>
                    </div>
                    <progress className="mt-3 h-2 w-full accent-brand-700" value={Math.min(type.sold, total)} max={total} aria-label={`${type.name}: ${type.sold} sold, ${type.remaining} remaining`} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

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
