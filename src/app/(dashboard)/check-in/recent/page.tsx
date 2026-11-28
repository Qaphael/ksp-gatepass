import { redirect } from "next/navigation";
import { RecentCheckInsTable, type RecentCheckInRow } from "@/components/check-in/recent-checkins-table";
import { SessionAdmissionCount } from "@/components/check-in/session-admission-count";
import { Frame, FramePanel } from "@/components/reui/frame";
import { PageHeader } from "@/components/ui/page-header";
import { UrlFiltersBar } from "@/components/ui/url-filters-bar";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { checkInListQuerySchema } from "@/lib/validation/check-in";
import { getAttendanceSummary, listRecentCheckIns } from "@/server/services/check-in.service";
import { listEvents } from "@/server/services/events.service";

export const instant = false;

export default async function RecentCheckInsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; before?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "checkin:read-recent")) redirect("/dashboard");

  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === params.eventId) ?? events[0];
  const data = event
    ? checkInListQuerySchema.parse({
        eventId: event.id,
        limit: 100,
        ...(params.before ? { before: params.before } : {}),
      })
    : null;
  const [summary, rows] = data
    ? await Promise.all([getAttendanceSummary(ctx, event!.id), listRecentCheckIns(ctx, data)])
    : [null, []];

  const next = rows.length === 100 ? rows[rows.length - 1]?.checkedInAt : undefined;
  const nextCursorUrl =
    next && event
      ? `/check-in/recent?eventId=${encodeURIComponent(event.id)}&before=${encodeURIComponent(next)}`
      : null;

  const tableRows: RecentCheckInRow[] = rows.map((row) => ({
    id: row.id,
    serial: row.serial,
    ticketTypeName: row.ticketTypeName,
    gate: row.gate,
    checkedInAt: row.checkedInAt,
    verifierName: row.verifier.displayName,
    corrections: row.corrections.map((c) => ({
      id: c.id,
      reason: c.reason,
      createdAt: c.createdAt,
      actorName: c.actorName,
    })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Attendance" description="Recent admissions and event attendance totals." />

      {events.length > 0 ? (
        <UrlFiltersBar
          basePath="/check-in/recent"
          fields={[
            {
              id: "eventId",
              label: "Event",
              type: "select",
              options: events.map((item) => ({ value: item.id, label: item.name })),
            },
          ]}
          initialValues={{ eventId: event?.id }}
        />
      ) : null}

      {summary ? (
        <Frame spacing="default">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SessionAdmissionCount eventId={summary.eventId} />
            {[
              ["Checked in", summary.checkedIn],
              ["Tickets sold", summary.ticketsSold],
              ["Awaiting", summary.notYetCheckedIn],
              ["Capacity", summary.capacity],
            ].map(([label, value]) => (
              <FramePanel key={String(label)} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium">{label}</span>
                <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
              </FramePanel>
            ))}
          </div>
        </Frame>
      ) : null}

      <RecentCheckInsTable
        rows={tableRows}
        canOverride={can(ctx.role, "checkin:override")}
        nextCursorUrl={nextCursorUrl}
      />
    </div>
  );
}
