import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Download, MapPin, Pencil, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DefList, DefRow } from "@/components/ui/def-list";
import { SectionCard } from "@/components/ui/section-card";
import { StatTile } from "@/components/ui/stat-tile";
import { formatUGX } from "@/components/ui/money";
import { EventActions } from "@/components/events/event-actions";
import { EventPoster } from "@/components/events/event-poster";
import { EventForm } from "@/components/events/event-form";
import { StateChip, StatusBadge } from "@/components/events/status-badges";
import { TicketTypeManager } from "@/components/events/ticket-type-manager";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import {
  getEvent,
  type EventDto,
} from "@/server/services/events.service";
import { listTicketTypes } from "@/server/services/ticket-types.service";
import { getTicketTypeProgress } from "@/server/services/dashboard.service";
import { getAttendanceSummary } from "@/server/services/check-in.service";
import { getReport } from "@/server/services/reports.service";
import { ServiceError } from "@/lib/api";
import { formatEventTimeRange } from "@/lib/time";

export const instant = false;

type Cell = string | number | null;

/** Read a labelled measure row (e.g. "Net recorded payments (UGX)"); null when absent. */
function reportNumber(rows: Cell[][], label: string): number | null {
  const value = rows.find((row) => row[0] === label)?.[1];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

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

  const canReadAttendance = can(ctx.role, "checkin:read-summary");
  const canReadMoney = can(ctx.role, "report:view-summary") || can(ctx.role, "report:export-full");

  const [ticketTypes, ticketProgress, attendance, reconciliation] = await Promise.all([
    listTicketTypes(ctx, id),
    getTicketTypeProgress(ctx, id),
    canReadAttendance ? getAttendanceSummary(ctx, id) : Promise.resolve(null),
    canReadMoney ? getReport(ctx, { eventId: id, type: "RECONCILIATION" }) : Promise.resolve(null),
  ]);

  const collectedUgx = reconciliation
    ? reportNumber(reconciliation.rows, "Net recorded payments (UGX)")
    : null;

  const eventEditable = event.status !== "COMPLETED" && event.status !== "ARCHIVED";
  const canEdit = can(ctx.role, "event:update") && eventEditable;
  // A single tile reads better full width; two or three use the two-column strip.
  const singleMetricTile = !attendance && collectedUgx === null;

  const sold = ticketProgress.reduce((sum, type) => sum + type.sold, 0);
  const capacity = attendance?.capacity ?? event.capacity;
  const soldPercent = capacity > 0 ? Math.round((sold / capacity) * 100) : 0;
  const admittedPercent =
    attendance && sold > 0 ? Math.round((attendance.checkedIn / sold) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <Link
        href="/events"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to events
      </Link>

      <section
        aria-labelledby="event-title"
        className={`overflow-hidden rounded-lg border border-border bg-card shadow-card ${event.branding.poster ? "grid md:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]" : ""}`}
      >
        <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} />
            <StateChip open={event.salesOpen} label="Sales" />
            <StateChip open={event.admissionOpen} label="Admission" />
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 id="event-title" className="text-2xl font-semibold leading-tight sm:text-3xl">
                {event.name}
              </h1>
              <div className="mt-2 flex min-w-0 flex-col gap-1 text-sm text-muted-foreground">
                <p className="flex min-w-0 items-center gap-1.5">
                  <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {event.eventDate} · {formatEventTimeRange(event.startTime, event.endTime)}
                  </span>
                </p>
                <p className="flex min-w-0 items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {event.venue}{event.address ? `, ${event.address}` : ""}
                  </span>
                </p>
              </div>
            </div>
            {canEdit ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href="#edit-event" />}
              >
                <Pencil aria-hidden="true" /> Edit details
              </Button>
            ) : null}
          </div>
        </div>

        {event.branding.poster ? (
          <aside className="min-w-0 border-t bg-muted/20 p-3 md:border-l md:border-t-0 md:p-4">
            <EventPoster poster={event.branding.poster} variant="display" className="max-h-[28rem] rounded-lg lg:max-h-[20rem]" />
            <a href={`${event.branding.poster.displayUrl}&download=1`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-primary underline underline-offset-4">
              <Download className="size-4" aria-hidden="true" /> Download poster
            </a>
          </aside>
        ) : null}
      </section>

      <section aria-label="Event metrics" className={`grid min-w-0 gap-3 ${singleMetricTile ? "grid-cols-1" : "grid-cols-2"} sm:grid-cols-3`}>
        <StatTile
          label="Sold / capacity"
          value={String(sold)}
          suffix={`/ ${capacity}`}
          sub={`${soldPercent}% · ${Math.max(0, capacity - sold)} remaining`}
        />
        {attendance ? (
          <StatTile
            label="Admitted / sold"
            value={String(attendance.checkedIn)}
            suffix={`/ ${sold} sold`}
            sub={`${admittedPercent}% · ${attendance.notYetCheckedIn} not yet admitted`}
          />
        ) : null}
        {collectedUgx !== null ? (
          <StatTile
            label="Collected"
            value={formatUGX(collectedUgx)}
            sub="Staff-recorded payments"
          />
        ) : null}
      </section>

      <TicketTypeManager
        eventId={event.id}
        canManage={can(ctx.role, "ticket-type:manage")}
        eventEditable={eventEditable}
        ticketTypes={ticketTypes}
        progress={ticketProgress}
      />

      <SectionCard
        title="Event rules"
        description="Read-only summary of the policies the server enforces. Change them in the event form."
        action={
          canEdit ? (
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href="#edit-event" />}>
              Edit event
            </Button>
          ) : undefined
        }
      >
        <DefList>
          <DefRow label="Admission policy">
            {event.admissionPolicy === "FULL_PAYMENT" ? "Full payment required" : event.admissionPolicy}
          </DefRow>
          <DefRow label="Require buyer name and phone">
            {event.requireBuyerDetails ? "Required" : "Not required"}
          </DefRow>
          <DefRow label="Require full payment at seller confirmation">
            {event.requireFullPaymentAtSale ? "Required" : "Not required"}
          </DefRow>
          <DefRow label="Allow sellers to enter a serial manually">
            {event.allowSellerManualSale ? "Allowed" : "Not allowed"}
          </DefRow>
          <DefRow label="Require ticket stock issued to the seller">
            {event.requireStockIssue ? "Required" : "Not required"}
          </DefRow>
        </DefList>
      </SectionCard>

      <Card>
        <CardHeader>
          <CardTitle>Sales and admission controls</CardTitle>
        </CardHeader>
        <CardContent>
          <EventActions
            event={event}
            permissions={{
              publish: can(ctx.role, "event:update"),
              openSales: can(ctx.role, "event:open-sales"),
              closeSales: can(ctx.role, "event:close-sales"),
              openAdmission: can(ctx.role, "event:open-admission"),
              closeAdmission: can(ctx.role, "event:close-admission"),
              complete: can(ctx.role, "event:complete"),
              archive: can(ctx.role, "event:archive"),
            }}
          />
        </CardContent>
      </Card>

      {can(ctx.role, "template:manage") ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
          <div className="min-w-0"><h2 className="text-base font-semibold">Designed ticket</h2><p className="text-sm text-muted-foreground">Manage artwork, measured print zones and calibration.</p></div>
          <Button variant="outline" nativeButton={false} render={<Link href={`/events/${event.id}/ticket-templates`} />}><Ticket /> Ticket templates</Button>
        </section>
      ) : null}

      <SectionCard title="Event details" description="Times are stored in the event timezone.">
        <DefList>
          <DefRow label="Timezone">{event.timezone}</DefRow>
          <DefRow label="Allocated capacity">
            {event.allocatedCapacity} of {event.capacity} tickets across {event.ticketTypeCount}{" "}
            {event.ticketTypeCount === 1 ? "category" : "categories"}
          </DefRow>
          <DefRow label="Sales window">
            {event.salesOpensAtLocal && event.salesClosesAtLocal
              ? `${event.salesOpensAtLocal} → ${event.salesClosesAtLocal}`
              : "Not set"}
          </DefRow>
          <DefRow label="Admission window">
            {event.admissionOpensAtLocal && event.admissionClosesAtLocal
              ? `${event.admissionOpensAtLocal} → ${event.admissionClosesAtLocal}`
              : "Not set"}
          </DefRow>
          <DefRow label="Organiser contact">{event.organiserContact ?? "—"}</DefRow>
          <DefRow label="Accent colour">{event.accentColor ?? "—"}</DefRow>
          <DefRow label="Ticket footer">{event.ticketFooterText ?? "—"}</DefRow>
        </DefList>
      </SectionCard>

      {canEdit ? (
        <section id="edit-event" className="scroll-mt-20">
          <h2 className="mb-3 text-lg font-semibold">Edit event</h2>
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
