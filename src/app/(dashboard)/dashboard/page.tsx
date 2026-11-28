import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ActivityIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  DownloadIcon,
  MapPinIcon,
  PlusIcon,
  ScanLineIcon,
  TicketIcon,
  UsersIcon,
} from "lucide-react";
import { DashboardConnection } from "@/components/check-in/dashboard-connection";
import { EventPoster } from "@/components/events/event-poster";
import { StatusBadge } from "@/components/events/status-badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatUGX } from "@/components/ui/money";
import { StatusBadge as DomainStatusBadge } from "@/components/ui/status-badge";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/role";
import { formatDateTime } from "@/lib/time";
import {
  getAttendanceSummary,
  listRecentCheckIns,
  listScanAttempts,
} from "@/server/services/check-in.service";
import { getDailyAdmissionCount, getSellerDashboardMetrics } from "@/server/services/dashboard.service";
import { listEvents, type EventDto } from "@/server/services/events.service";
import { getReport } from "@/server/services/reports.service";
import { listSales } from "@/server/services/sales.service";

export const instant = false;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "dashboard:view")) redirect("/scanner");

  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === params.eventId) ?? selectEvent(events);

  if (!event) return <EmptyDashboard role={ctx.role} />;

  if (ctx.role === "VERIFIER") {
    const [daily, recent, attempts] = await Promise.all([
      getDailyAdmissionCount(ctx, event.id),
      listRecentCheckIns(ctx, { eventId: event.id, limit: 5 }),
      listScanAttempts(ctx, { eventId: event.id, limit: 5 }),
    ]);
    return (
      <VerifierDashboard
        event={event}
        count={daily.count}
        day={daily.day}
        recent={recent}
        attempts={attempts}
      />
    );
  }

  if (ctx.role === "SELLER") {
    const metrics = await getSellerDashboardMetrics(ctx, event.id);
    const [sales, balances] = await Promise.all([
      listSales(ctx, { eventId: event.id, page: 1, pageSize: 5 }),
      getReport(ctx, { eventId: event.id, type: "OUTSTANDING_BALANCES" }),
    ]);
    return (
      <SellerDashboard
        event={event}
        metrics={metrics}
        recent={sales.sales}
        outstandingRows={balances.rows.length}
      />
    );
  }

  if (ctx.role === "SUPERVISOR") {
    const day = localEventDay(event);
    const [attendance, today, attempts, byGate, recent] = await Promise.all([
      getAttendanceSummary(ctx, event.id),
      getDailyAdmissionCount(ctx, event.id),
      getReport(ctx, { eventId: event.id, type: "SCAN_ATTEMPTS", from: day, to: day }),
      getReport(ctx, { eventId: event.id, type: "ATTENDANCE_BY_GATE", from: day, to: day }),
      listRecentCheckIns(ctx, { eventId: event.id, limit: 5 }),
    ]);
    return (
      <SupervisorDashboard
        event={event}
        attendance={attendance}
        today={today.count}
        attempts={attempts.rows}
        byGate={byGate.rows}
        recent={recent}
      />
    );
  }

  const [inventory, reconciliation, attendance, daily, sales, recent, balances, attempts] =
    await Promise.all([
      getReport(ctx, { eventId: event.id, type: "TICKET_INVENTORY" }),
      getReport(ctx, { eventId: event.id, type: "RECONCILIATION" }),
      getAttendanceSummary(ctx, event.id),
      getDailyAdmissionCount(ctx, event.id),
      listSales(ctx, { eventId: event.id, page: 1, pageSize: 5 }),
      listRecentCheckIns(ctx, { eventId: event.id, limit: 5 }),
      getReport(ctx, { eventId: event.id, type: "OUTSTANDING_BALANCES" }),
      getReport(ctx, {
        eventId: event.id,
        type: "SCAN_ATTEMPTS",
        from: localEventDay(event),
        to: localEventDay(event),
      }),
    ]);

  const sold = inventory.rows
    .filter((row) => row[1] === "SOLD")
    .reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const paidUgx = reportNumber(reconciliation.rows, "Net recorded payments (UGX)");
  const outstandingUgx = reportNumber(reconciliation.rows, "Outstanding balances (UGX)");
  const failed = attempts.rows
    .filter((row) => row[1] !== "ADMITTED" && row[1] !== "ELIGIBLE")
    .reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const revoked = inventory.rows
    .filter((row) => row[1] === "REVOKED")
    .reduce((sum, row) => sum + Number(row[2] ?? 0), 0);

  return (
    <AdminDashboard
      event={event}
      stats={{
        sold,
        paidUgx,
        outstandingUgx,
        checkedIn: attendance.checkedIn,
        remaining: attendance.notYetCheckedIn,
        capacity: event.capacity,
        today: daily.count,
      }}
      sales={sales.sales}
      checkins={recent}
      alerts={{
        balances: balances.rows.length,
        failed,
        revoked,
        configuration: event.ticketTypeCount === 0,
      }}
    />
  );
}

function selectEvent(events: EventDto[]): EventDto | null {
  const active = events.filter(
    (event) => event.status !== "COMPLETED" && event.status !== "ARCHIVED",
  );
  return (
    active.find((event) => event.admissionOpen) ??
    active.find((event) => event.salesOpen) ??
    active.find((event) => event.status === "SCHEDULED") ??
    active[0] ??
    events[0] ??
    null
  );
}

function localEventDay(event: EventDto): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: event.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === name)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function reportNumber(rows: (string | number | null)[][], label: string): number {
  return Number(rows.find((row) => row[0] === label)?.[1] ?? 0);
}

function EmptyDashboard({
  role,
}: {
  role: "SUPER_ADMIN" | "ADMIN" | "SELLER" | "VERIFIER" | "SUPERVISOR";
}) {
  return (
    <Frame spacing="default">
      <FramePanel>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDaysIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No event is ready</EmptyTitle>
            <EmptyDescription>
              An administrator needs to configure an event before your{" "}
              {ROLE_LABELS[role].toLowerCase()} dashboard can show activity.
            </EmptyDescription>
          </EmptyHeader>
          {role === "ADMIN" || role === "SUPER_ADMIN" ? (
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/events/new" />}>
                Create event
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      </FramePanel>
    </Frame>
  );
}

function DashboardHeader({
  event,
  eyebrow,
  actions,
}: {
  event: EventDto;
  eyebrow: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {event.branding.poster ? (
        <div className="flex flex-col gap-2">
          <EventPoster poster={event.branding.poster} variant="display" className="max-h-[42dvh] md:hidden" />
          <EventPoster poster={event.branding.poster} variant="banner" className="hidden md:block" />
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="w-fit"
            render={<a href={`${event.branding.poster.displayUrl}&download=1`} />}
          >
            <DownloadIcon aria-hidden="true" />
            Download poster
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            {eyebrow}
          </span>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{event.name}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1">
              <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {event.venue}
            </span>
            <span aria-hidden className="bg-muted-foreground/40 size-1 shrink-0 rounded-full" />
            <span>{event.eventDate}</span>
            <span aria-hidden className="bg-muted-foreground/40 size-1 shrink-0 rounded-full" />
            <span className="inline-flex items-center gap-1 tabular-nums">
              <TicketIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {event.capacity} capacity
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={event.status} />
          <Badge variant={event.salesOpen ? "success-light" : "warning-light"}>
            {event.salesOpen ? "Sales open" : "Sales closed"}
          </Badge>
          <Badge variant={event.admissionOpen ? "success-light" : "warning-light"}>
            {event.admissionOpen ? "Admission open" : "Admission closed"}
          </Badge>
        </div>
      </div>

      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function KpiPanel({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <FramePanel className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      {detail ? <span className="text-muted-foreground truncate text-xs">{detail}</span> : null}
    </FramePanel>
  );
}

function AdminDashboard({
  event,
  stats,
  sales,
  checkins,
  alerts,
}: {
  event: EventDto;
  stats: {
    sold: number;
    paidUgx: number;
    outstandingUgx: number;
    checkedIn: number;
    remaining: number;
    capacity: number;
    today: number;
  };
  sales: Awaited<ReturnType<typeof listSales>>["sales"];
  checkins: Awaited<ReturnType<typeof listRecentCheckIns>>;
  alerts: { balances: number; failed: number; revoked: number; configuration: boolean };
}) {
  const soldPct = stats.capacity ? Math.round((stats.sold / stats.capacity) * 100) : 0;
  const admittedPct = stats.sold ? Math.round((stats.checkedIn / stats.sold) * 100) : 0;
  const hasAlerts =
    alerts.balances > 0 || alerts.failed > 0 || alerts.revoked > 0 || alerts.configuration;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        event={event}
        eyebrow="Operational overview"
        actions={
          <>
            <Button
              nativeButton={false}
              size="sm"
              render={<Link href={`/sales/new?eventId=${encodeURIComponent(event.id)}`} />}
            >
              <PlusIcon aria-hidden="true" />
              New sale
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href={`/scanner?eventId=${encodeURIComponent(event.id)}`} />}
            >
              <ScanLineIcon aria-hidden="true" />
              Check-in
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href={`/reports?eventId=${encodeURIComponent(event.id)}`} />}
            >
              <ActivityIcon aria-hidden="true" />
              Reports
            </Button>
            <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/team" />}>
              <UsersIcon aria-hidden="true" />
              Team
            </Button>
          </>
        }
      />

      {hasAlerts ? (
        <Alert variant="warning">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Attention needed</AlertTitle>
          <AlertDescription>
            {[
              alerts.configuration ? "No ticket categories configured yet" : null,
              alerts.balances > 0 ? `${alerts.balances} open customer balances` : null,
              alerts.failed > 0 ? `${alerts.failed} unsuccessful scans today` : null,
              alerts.revoked > 0 ? `${alerts.revoked} revoked tickets` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Frame spacing="default">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiPanel
            label="Sold tickets"
            value={`${stats.sold} / ${stats.capacity}`}
            detail={`${soldPct}% of event capacity`}
          />
          <KpiPanel
            label="Total collected"
            value={formatUGX(stats.paidUgx)}
            detail="Net recorded payments"
          />
          <KpiPanel
            label="Outstanding"
            value={formatUGX(stats.outstandingUgx)}
            detail="Pledges & partial balances"
          />
          <KpiPanel
            label="Admitted"
            value={`${stats.checkedIn} / ${stats.sold}`}
            detail={`${admittedPct}% of sold · ${stats.today} today`}
          />
        </div>
      </Frame>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <RecentSalesFrame sales={sales} timezone={event.timezone} />
        <RecentCheckinsFrame rows={checkins} timezone={event.timezone} />
      </div>
    </div>
  );
}

function SellerDashboard({
  event,
  metrics,
  recent,
  outstandingRows,
}: {
  event: EventDto;
  metrics: Awaited<ReturnType<typeof getSellerDashboardMetrics>>;
  recent: Awaited<ReturnType<typeof listSales>>["sales"];
  outstandingRows: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        event={event}
        eyebrow="Seller overview"
        actions={
          <Button
            nativeButton={false}
            size="sm"
            render={<Link href={`/sales/new?eventId=${encodeURIComponent(event.id)}`} />}
          >
            <PlusIcon aria-hidden="true" />
            New sale
          </Button>
        }
      />

      <Frame spacing="default">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiPanel label="Sales today" value={String(metrics.salesCount)} />
          <KpiPanel label="Sales value" value={formatUGX(metrics.salesValueUgx)} detail="Today · UGX" />
          <KpiPanel
            label="Received net today"
            value={formatUGX(metrics.receivedNetUgx)}
            detail="Less reversals & refunds"
          />
          <KpiPanel
            label="Outstanding"
            value={formatUGX(metrics.outstandingUgx)}
            detail={`${outstandingRows} customer ${outstandingRows === 1 ? "balance" : "balances"}`}
          />
        </div>
      </Frame>

      <RecentSalesFrame sales={recent} title="Recent transactions" />
    </div>
  );
}

function VerifierDashboard({
  event,
  count,
  day,
  recent,
  attempts,
}: {
  event: EventDto;
  count: number;
  day: string;
  recent: Awaited<ReturnType<typeof listRecentCheckIns>>;
  attempts: Awaited<ReturnType<typeof listScanAttempts>>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        event={event}
        eyebrow="Gate overview"
        actions={
          <>
            <Button
              nativeButton={false}
              size="sm"
              render={<Link href={`/scanner?eventId=${encodeURIComponent(event.id)}`} />}
            >
              <ScanLineIcon aria-hidden="true" />
              Scan ticket
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href={`/check-in/manual?eventId=${encodeURIComponent(event.id)}`} />}
            >
              <ClipboardListIcon aria-hidden="true" />
              Enter serial
            </Button>
          </>
        }
      />

      <DashboardConnection eventId={event.id} />

      <Frame spacing="default">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiPanel label={`Successful check-ins (${day})`} value={String(count)} />
          <KpiPanel label="Recent scan checks" value={String(attempts.length)} detail="Latest 5 recorded" />
        </div>
      </Frame>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <RecentAttemptsFrame rows={attempts} timezone={event.timezone} />
        <RecentCheckinsFrame rows={recent} timezone={event.timezone} />
      </div>
    </div>
  );
}

function SupervisorDashboard({
  event,
  attendance,
  today,
  attempts,
  byGate,
  recent,
}: {
  event: EventDto;
  attendance: Awaited<ReturnType<typeof getAttendanceSummary>>;
  today: number;
  attempts: (string | number | null)[][];
  byGate: (string | number | null)[][];
  recent: Awaited<ReturnType<typeof listRecentCheckIns>>;
}) {
  const rate = attendance.ticketsSold
    ? Math.min(100, Math.round((attendance.checkedIn / attendance.ticketsSold) * 100))
    : 0;
  const repeated = attempts
    .filter((row) => row[1] === "ALREADY_USED")
    .reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const failed = attempts
    .filter((row) => row[1] !== "ADMITTED" && row[1] !== "ELIGIBLE")
    .reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const gates = new Map<string, number>();
  for (const row of byGate) {
    gates.set(String(row[1]), (gates.get(String(row[1])) ?? 0) + Number(row[2] ?? 0));
  }

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader event={event} eyebrow="Supervisor overview" />

      <Frame spacing="default">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiPanel label="Admissions" value={String(attendance.checkedIn)} detail={`${today} today`} />
          <KpiPanel
            label="Admission rate"
            value={`${rate}%`}
            detail={`${attendance.checkedIn} of ${attendance.ticketsSold} sold`}
          />
          <KpiPanel label="Failed scans" value={String(failed)} detail="Today" />
          <KpiPanel label="Repeat scans" value={String(repeated)} detail="Already admitted today" />
        </div>
      </Frame>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Frame spacing="default" stacked>
          <FrameHeader>
            <FrameTitle>Admissions by gate</FrameTitle>
            <FrameDescription>Today&apos;s successful check-ins</FrameDescription>
          </FrameHeader>
          {gates.size > 0 ? (
            [...gates]
              .sort((a, b) => b[1] - a[1])
              .map(([gate, value]) => (
                <FramePanel key={gate} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">{gate}</span>
                  <span className="text-sm font-semibold tabular-nums">{value}</span>
                </FramePanel>
              ))
          ) : (
            <FramePanel>
              <p className="text-muted-foreground text-sm">No admissions recorded today.</p>
            </FramePanel>
          )}
        </Frame>

        <RecentCheckinsFrame rows={recent} timezone={event.timezone} />
      </div>
    </div>
  );
}

function RecentSalesFrame({
  sales,
  title = "Recent sales",
  timezone = "Africa/Kampala",
}: {
  sales: Awaited<ReturnType<typeof listSales>>["sales"];
  title?: string;
  timezone?: string;
}) {
  return (
    <Frame spacing="default" stacked>
      <FrameHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <FrameTitle>{title}</FrameTitle>
            <FrameDescription>Latest recorded transactions</FrameDescription>
          </div>
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/sales" />}>
            All sales
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        </div>
      </FrameHeader>

      {sales.length > 0 ? (
        sales.map((sale) => {
          const time = formatDateTime(sale.createdAt, timezone, "en-UG", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <FramePanel key={sale.id}>
              <Link
                href={`/sales/${sale.id}`}
                className="flex items-center justify-between gap-3 transition-colors hover:opacity-80"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {sale.customerName ?? "Walk-in"}
                  </span>
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span className="font-mono">{sale.reference}</span>
                    <span aria-hidden className="bg-muted-foreground/40 size-1 shrink-0 rounded-full" />
                    <time>{time}</time>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatUGX(sale.totalUgx)}
                  </span>
                  <DomainStatusBadge domain="sale" status={sale.status} />
                </div>
              </Link>
            </FramePanel>
          );
        })
      ) : (
        <FramePanel>
          <p className="text-muted-foreground text-sm">No sales recorded yet.</p>
        </FramePanel>
      )}
    </Frame>
  );
}

function RecentCheckinsFrame({
  rows,
  title = "Latest admissions",
  timezone = "Africa/Kampala",
}: {
  rows: Awaited<ReturnType<typeof listRecentCheckIns>>;
  title?: string;
  timezone?: string;
}) {
  return (
    <Frame spacing="default" stacked>
      <FrameHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <FrameTitle>{title}</FrameTitle>
            <FrameDescription>Most recent admitted tickets</FrameDescription>
          </div>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href="/check-in/recent" />}
          >
            All recent
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        </div>
      </FrameHeader>

      {rows.length > 0 ? (
        rows.map((row) => {
          const time = formatDateTime(row.checkedInAt, timezone, "en-UG", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <FramePanel key={row.id} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm font-semibold">{row.serial}</span>
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="truncate">{row.gate}</span>
                  <span aria-hidden className="bg-muted-foreground/40 size-1 shrink-0 rounded-full" />
                  <time>{time}</time>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{row.ticketTypeName}</Badge>
                <Badge variant="success-light">Admitted</Badge>
              </div>
            </FramePanel>
          );
        })
      ) : (
        <FramePanel>
          <p className="text-muted-foreground text-sm">No tickets checked in yet.</p>
        </FramePanel>
      )}
    </Frame>
  );
}

function RecentAttemptsFrame({
  rows,
  timezone,
}: {
  rows: Awaited<ReturnType<typeof listScanAttempts>>;
  timezone: string;
}) {
  return (
    <Frame spacing="default" stacked>
      <FrameHeader>
        <FrameTitle>Recent scan outcomes</FrameTitle>
        <FrameDescription>Latest ticket checks for this event</FrameDescription>
      </FrameHeader>
      {rows.length > 0 ? (
        rows.map((row) => (
          <FramePanel key={row.id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-mono text-sm font-semibold">
                {row.serial ?? "Unrecognized ticket"}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {row.method} · {row.gate ?? "No gate"} ·{" "}
                <time>
                  {formatDateTime(row.attemptedAt, timezone, "en-UG", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </span>
            </div>
            <DomainStatusBadge domain="scan" status={row.resultCode} />
          </FramePanel>
        ))
      ) : (
        <FramePanel>
          <p className="text-muted-foreground text-sm">No scan attempts recorded yet.</p>
        </FramePanel>
      )}
      <FrameFooter>
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<Link href="/check-in/attempts" />}
        >
          View all attempts
        </Button>
      </FrameFooter>
    </Frame>
  );
}
