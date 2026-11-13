import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Download, MapPin, Pencil, Ticket } from "lucide-react";
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
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to events
      </Link>

      <section
        aria-labelledby="event-title"
        className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${event.branding.poster ? "grid md:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]" : ""}`}
      >
        <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={event.status} />
                <OpenBadge open={event.salesOpen} label="Sales" />
                <OpenBadge open={event.admissionOpen} label="Admission" />
              </div>
              <h1 id="event-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                {event.name}
              </h1>
            </div>
            {can(ctx.role, "event:update") && eventEditable ? (
              <Button variant="outline" size="sm" className="shrink-0">
                <Pencil aria-hidden="true" /> Edit details below
              </Button>
            ) : null}
          </div>

          <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div className="flex min-w-0 items-start gap-3">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date and time</dt><dd className="mt-1 font-medium">{event.eventDate} · {formatEventTimeRange(event.startTime, event.endTime)}</dd></div>
            </div>
            <div className="flex min-w-0 items-start gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Venue</dt><dd className="mt-1 font-medium">{event.venue}{event.address ? `, ${event.address}` : ""}</dd></div>
            </div>
          </dl>

          {event.status === "DRAFT" && can(ctx.role, "event:update") ? (
            <div className="border-t pt-4">
              <p className="mb-3 text-sm text-muted-foreground">This event is still a draft. Publish it when the details are ready.</p>
              <EventActions
                event={event}
                permissions={{ publish: true, openSales: false, closeSales: false, openAdmission: false, closeAdmission: false, complete: false, archive: false }}
              />
            </div>
          ) : null}
        </div>
        {event.branding.poster ? (
          <aside className="min-w-0 border-t bg-muted/20 p-3 md:border-l md:border-t-0 md:p-4">
            <EventPoster poster={event.branding.poster} variant="display" className="max-h-[28rem] rounded-xl lg:max-h-[20rem]" />
            <a href={`${event.branding.poster.displayUrl}&download=1`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary underline underline-offset-4">
              <Download className="size-4" aria-hidden="true" /> Download poster
            </a>
          </aside>
        ) : null}
      </section>

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

      {can(ctx.role, "template:manage") ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div><h2 className="font-semibold">Designed ticket</h2><p className="text-sm text-muted-foreground">Manage artwork, measured print zones and calibration.</p></div>
          <Button variant="outline" nativeButton={false} render={<Link href={`/events/${event.id}/ticket-templates`} />}><Ticket /> Ticket templates</Button>
        </section>
      ) : null}

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
