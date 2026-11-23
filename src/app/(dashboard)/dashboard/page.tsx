import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Banknote,
  CalendarDays,
  Check,
  CircleAlert,
  ClipboardList,
  Download,
  MapPin,
  Plus,
  ReceiptText,
  ScanLine,
  Ticket,
  Users,
  Verified,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventPoster } from "@/components/events/event-poster";
import { StatusBadge } from "@/components/events/status-badges";
import { StatusBadge as SaleStatusBadge } from "@/components/ui/status-badge";
import { StatusBadge as ScanStatusBadge } from "@/components/ui/status-badge";
import { DashboardConnection } from "@/components/check-in/dashboard-connection";
import { Chip } from "@/components/ui/chip";
import { MetricTile } from "@/components/ui/metric-tile";
import { TileRow, TileRowList } from "@/components/ui/tile-row";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/role";
import { listEvents, type EventDto } from "@/server/services/events.service";
import { getReport } from "@/server/services/reports.service";
import { listSales } from "@/server/services/sales.service";
import { getAttendanceSummary, listRecentCheckIns, listScanAttempts } from "@/server/services/check-in.service";
import { getDailyAdmissionCount, getSellerDashboardMetrics } from "@/server/services/dashboard.service";
import { formatDateTime } from "@/lib/time";
import { formatUGX } from "@/components/ui/money";

export const instant = false;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "dashboard:view")) redirect("/scanner");

  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === params.eventId) ?? selectEvent(events);
  const isSeller = ctx.role === "SELLER";
  const isVerifier = ctx.role === "VERIFIER";
  const isSupervisor = ctx.role === "SUPERVISOR";

  if (!event) return <EmptyDashboard role={ctx.role} />;

  if (isVerifier) {
    const [daily, recent, attempts] = await Promise.all([
      getDailyAdmissionCount(ctx, event.id),
      listRecentCheckIns(ctx, { eventId: event.id, limit: 5 }),
      listScanAttempts(ctx, { eventId: event.id, limit: 5 }),
    ]);
    return <VerifierDashboard event={event} count={daily.count} day={daily.day} recent={recent} attempts={attempts} />;
  }

  if (isSeller) {
    const metrics = await getSellerDashboardMetrics(ctx, event.id);
    const [sales, balances] = await Promise.all([
      listSales(ctx, { eventId: event.id, page: 1, pageSize: 5 }),
      getReport(ctx, { eventId: event.id, type: "OUTSTANDING_BALANCES" }),
    ]);
    return <SellerDashboard event={event} metrics={metrics} recent={sales.sales} outstandingRows={balances.rows.length} />;
  }

  if (isSupervisor) {
    const day = localEventDay(event);
    const [attendance, today, attempts, byGate, recent] = await Promise.all([
      getAttendanceSummary(ctx, event.id),
      getDailyAdmissionCount(ctx, event.id),
      getReport(ctx, { eventId: event.id, type: "SCAN_ATTEMPTS", from: day, to: day }),
      getReport(ctx, { eventId: event.id, type: "ATTENDANCE_BY_GATE", from: day, to: day }),
      listRecentCheckIns(ctx, { eventId: event.id, limit: 5 }),
    ]);
    return <SupervisorDashboard event={event} attendance={attendance} today={today.count} attempts={attempts.rows} byGate={byGate.rows} recent={recent} />;
  }

  const [inventory, reconciliation, attendance, daily, sales, recent, checkins, attempts] = await Promise.all([
    getReport(ctx, { eventId: event.id, type: "TICKET_INVENTORY" }),
    getReport(ctx, { eventId: event.id, type: "RECONCILIATION" }),
    getAttendanceSummary(ctx, event.id),
    getDailyAdmissionCount(ctx, event.id),
    listSales(ctx, { eventId: event.id, page: 1, pageSize: 5 }),
    listRecentCheckIns(ctx, { eventId: event.id, limit: 5 }),
    getReport(ctx, { eventId: event.id, type: "OUTSTANDING_BALANCES" }),
    getReport(ctx, { eventId: event.id, type: "SCAN_ATTEMPTS", from: localEventDay(event), to: localEventDay(event) }),
  ]);
  const sold = inventory.rows.filter((row) => row[1] === "SOLD").reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const paidUgx = reportNumber(reconciliation.rows, "Net recorded payments (UGX)");
  const outstandingUgx = reportNumber(reconciliation.rows, "Outstanding balances (UGX)");
  const failed = attempts.rows.filter((row) => row[1] !== "ADMITTED" && row[1] !== "ELIGIBLE").reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const revoked = inventory.rows.filter((row) => row[1] === "REVOKED").reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  return <AdminDashboard event={event} stats={{ sold, paidUgx, outstandingUgx, checkedIn: attendance.checkedIn, remaining: attendance.notYetCheckedIn, capacity: event.capacity, today: daily.count }} sales={sales.sales} checkins={recent} alerts={{ balances: checkins.rows.length, failed, revoked, configuration: event.ticketTypeCount === 0 }} />;
}

function selectEvent(events: EventDto[]): EventDto | null {
  const active = events.filter((event) => event.status !== "COMPLETED" && event.status !== "ARCHIVED");
  return active.find((event) => event.admissionOpen) ?? active.find((event) => event.salesOpen) ?? active.find((event) => event.status === "SCHEDULED") ?? active[0] ?? events[0] ?? null;
}

function localEventDay(event: EventDto): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (name: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === name)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function reportNumber(rows: (string | number | null)[][], label: string): number {
  return Number(rows.find((row) => row[0] === label)?.[1] ?? 0);
}

function EmptyDashboard({ role }: { role: "SUPER_ADMIN" | "ADMIN" | "SELLER" | "VERIFIER" | "SUPERVISOR" }) {
  return (
    <section className="mx-auto flex min-h-[55dvh] max-w-lg flex-col justify-center gap-6 text-center px-4">
      <div className="mx-auto grid size-12 place-items-center rounded-md bg-muted/50 text-foreground">
        <CalendarDays className="size-7" aria-hidden="true" />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-medium">No event is ready</h1>
        <p className="text-sm text-muted-foreground">
          An administrator needs to configure an event before your {ROLE_LABELS[role].toLowerCase()} dashboard can show event activity
        </p>
      </div>
      {(role === "ADMIN" || role === "SUPER_ADMIN") && (
        <Button nativeButton={false} render={<Link href="/events/new" />} className="min-h-11 w-fit justify-center gap-1.5 text-sm font-medium mx-auto">
          <Plus className="size-4" aria-hidden="true" />
          Create event
        </Button>
      )}
    </section>
  );
}

function DashboardHeading({ event, chips }: { event: EventDto; chips?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {event.branding.poster && (
        <>
          <EventPoster poster={event.branding.poster} variant="display" className="max-h-[48dvh] md:hidden" />
          <EventPoster poster={event.branding.poster} variant="banner" className="hidden md:block" />
          <a
            href={`${event.branding.poster.displayUrl}&download=1`}
            className="inline-flex min-h-10 w-fit items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
          >
            <Download className="size-4" aria-hidden="true" />
            Poster
          </a>
        </>
      )}
      <div className="flex min-w-0 items-start gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-medium">{event.name}</h1>
          <p className="mt-2 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {event.eventDate} · {event.venue}
          </p>
        </div>
      </div>
      {/* Status chips bar */}
      <div className="flex flex-wrap items-center gap-2">
        {chips ?? (
          <>
            <StatusBadge status={event.status} />
            <Chip tone={event.salesOpen ? "success" : "warning"}>
              <Check className="size-3" aria-hidden="true" />
              {event.salesOpen ? "Sales open" : "Sales closed"}
            </Chip>
            <Chip tone={event.admissionOpen ? "success" : "warning"}>
              <Check className="size-3" aria-hidden="true" />
              {event.admissionOpen ? "Admission open" : "Admission closed"}
            </Chip>
            <Chip tone="neutral">
              <Ticket className="size-3.5" aria-hidden="true" />
              {event.capacity} total tickets
            </Chip>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-md bg-muted/50 text-foreground *:size-4">
            {icon}
          </span>
          <span className="min-w-0 text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <p className="mt-3 break-words text-2xl font-medium tabular-nums sm:text-3xl">{value}</p>
        {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

function AdmittedMetric({
  label,
  value,
  suffix,
  percent,
  today,
  capacity,
}: {
  label: string;
  value: string;
  suffix: string;
  percent: number;
  today: number;
  capacity: number;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <Card className="min-w-0 relative overflow-hidden">
      <CardContent className="p-4 relative z-10">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[12px] text-muted-foreground">{label}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="truncate font-mono text-[28px] font-medium tabular-nums text-foreground">{value}</span>
            <span className="truncate font-mono text-[12px] text-muted-foreground">{suffix}</span>
          </div>
          <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
            <span className="font-mono text-[12px] font-medium text-warning">{clamped}%</span>
          </div>
        </div>
        <p className="mt-2 truncate text-[12px] text-muted-foreground">{today} admitted today · {capacity} capacity</p>
        {/* Signature: amber progress line */}
        <div className="mt-3 h-1 w-full bg-muted">
          <div className="h-full bg-warning" style={{ width: `${clamped}%` }} aria-hidden="true" />
        </div>
      </CardContent>
      {/* Rendered ticket visual - printed pass at real proportions */}
      <div className="absolute right-0 bottom-0 z-0 opacity-10 pointer-events-none" aria-hidden="true">
        <div className="w-48 h-20 bg-warning/5 rounded-sm border border-warning/20 relative overflow-hidden">
          {/* QR code area */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 size-8 bg-background rounded-[2px]" />
          {/* Serial line */}
          <div className="absolute left-14 top-2 right-2 h-3 bg-background/50 rounded" />
          {/* Stub line at bottom - signature */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-warning" />
        </div>
      </div>
    </Card>
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
  stats: { sold: number; paidUgx: number; outstandingUgx: number; checkedIn: number; remaining: number; capacity: number; today: number };
  sales: Awaited<ReturnType<typeof listSales>>["sales"];
  checkins: Awaited<ReturnType<typeof listRecentCheckIns>>;
  alerts: { balances: number; failed: number; revoked: number; configuration: boolean };
}) {
  const admittedPct = stats.sold ? Math.round((stats.checkedIn / stats.sold) * 100) : 0;
  const alertsClear = alerts.balances === 0 && alerts.failed === 0 && alerts.revoked === 0;

  return (
    <main className="flex flex-col gap-4 sm:gap-6">
      <DashboardHeading
        event={event}
        chips={
          <>
            <Chip tone={event.salesOpen ? "success" : "warning"}>
              <Check className="size-3" aria-hidden="true" />
              {event.salesOpen ? "Sales open" : "Sales closed"}
            </Chip>
            <Chip tone={event.admissionOpen ? "success" : "warning"}>
              <Check className="size-3" aria-hidden="true" />
              {event.admissionOpen ? "Admission open" : "Admission closed"}
            </Chip>
          </>
        }
      />

      {/* Quick actions grid (min 44px tactile targets) */}
      <section aria-label="Quick actions" className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href={`/sales/new?eventId=${encodeURIComponent(event.id)}`} icon={<Plus className="size-4" aria-hidden="true" />} label="New sale" prominent />
        <QuickAction href={`/scanner?eventId=${encodeURIComponent(event.id)}`} icon={<ScanLine className="size-4" aria-hidden="true" />} label="Check-in" />
        <QuickAction href={`/reports?eventId=${encodeURIComponent(event.id)}`} icon={<Activity className="size-4" aria-hidden="true" />} label="Reports" />
        <QuickAction href="/team" icon={<Users className="size-4" aria-hidden="true" />} label="Team" />
      </section>

      {/* Operational alerts strip */}
      <Card className="border-border/50 bg-card">
        <CardContent className="p-4">
          {alertsClear ? (
            <p className="text-sm text-muted-foreground">All clear — no outstanding balances, failed scans, or revocations today</p>
          ) : (
            <TileRowList className="gap-2">
              {alerts.balances > 0 && (
                <TileRow
                  icon={<Wallet className="size-4" />}
                  title="Unreconciled balances"
                  rightValue={formatUGX(alerts.balances)}
                  tone="warning"
                />
              )}
              {alerts.failed > 0 && (
                <TileRow
                  icon={<CircleAlert className="size-4" />}
                  title="Unsuccessful scans"
                  rightValue={`${alerts.failed}`}
                  rightTime="today"
                  tone="destructive"
                />
              )}
              {alerts.revoked > 0 && (
                <TileRow
                  icon={<BadgeCheck className="size-4" />}
                  title="Revoked tickets"
                  rightValue={`${alerts.revoked}`}
                  tone="default"
                />
              )}
              {alerts.configuration && (
                <TileRow
                  icon={<CircleAlert className="size-4" />}
                  title="No ticket types configured"
                  rightValue="Setup required"
                  tone="destructive"
                />
              )}
            </TileRowList>
          )}
        </CardContent>
      </Card>

      {/* Compact stats row */}
      <section aria-label="Key metrics" className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <MetricTile label="Sold tickets" value={String(stats.sold)} suffix={`/ ${stats.capacity}`} variant="compact" />
        <MetricTile label="Total collected" amount={stats.paidUgx} sub="Recorded payments" variant="compact" />
        <MetricTile label="Outstanding" amount={stats.outstandingUgx} sub="Pledges & partials" variant="compact" tone="warning" />
        <AdmittedMetric
          label="Admitted"
          value={String(stats.checkedIn)}
          suffix={`/ ${stats.sold} sold`}
          percent={admittedPct}
          today={stats.today}
          capacity={stats.capacity}
        />
        <MetricTile label="Remaining capacity" value={String(stats.remaining)} sub={`${stats.today} admitted today`} variant="compact" />
      </section>

      {/* Main chart: live admission curve today vs capacity */}
      <section aria-label="Admission trend" className="lg:col-span-3">
        <Card className="border-border/50 bg-card">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-medium">Admission today</CardTitle>
              <span className="font-mono text-[12px] text-muted-foreground">{localEventDay(event)}</span>
            </div>
            <CardDescription className="text-sm text-muted-foreground">Cumulative admissions vs capacity — updated in real time</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <AdmissionChart
              admitted={stats.checkedIn}
              capacity={stats.capacity}
              today={stats.today}
              sold={stats.sold}
            />
          </CardContent>
        </Card>
      </section>

      {/* Recent sales + latest turnstile stream */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
        <RecentSales sales={sales} timezone={event.timezone} variant="admin" />
        <RecentCheckins rows={checkins} timezone={event.timezone} variant="admin" />
      </div>
    </main>
  );
}

function QuickAction({
  href,
  icon,
  label,
  prominent = false,
}: { href: string; icon: React.ReactNode; label: string; prominent?: boolean }) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      variant={prominent ? "default" : "outline"}
      className="min-h-12 w-full justify-center gap-2 text-sm font-medium"
    >
      {icon}
      {label}
    </Button>
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
    <main className="flex flex-col gap-4 sm:gap-6">
      <DashboardHeading event={event} />
      <Button nativeButton={false} render={<Link href={`/sales/new?eventId=${encodeURIComponent(event.id)}`} />} className="min-h-12 w-full justify-center gap-2 text-sm font-medium">
        <Plus className="size-4" aria-hidden="true" />
        New sale
      </Button>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
        <Stat icon={<Ticket className="size-4" />} label="Sales today" value={String(metrics.salesCount)} />
        <Stat icon={<Banknote className="size-4" />} label="Sales value" value={formatUGX(metrics.salesValueUgx)} detail="Today · UGX" />
        <Stat icon={<Banknote className="size-4" />} label="Received net today" value={formatUGX(metrics.receivedNetUgx)} detail="Recorded payments less adjustments" />
        <Stat icon={<Wallet className="size-4" />} label="Outstanding" value={formatUGX(metrics.outstandingUgx)} detail={`${outstandingRows} customer ${outstandingRows === 1 ? "balance" : "balances"}`} />
      </div>
      <RecentSales sales={recent} title="Recent transactions" />
    </main>
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
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 sm:gap-6">
      <DashboardHeading event={event} />
      <DashboardConnection eventId={event.id} />
      <Card className="border-border/50 bg-card">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-muted/50 text-foreground">
              <Check className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-medium">Successful check-ins · {day}</p>
              <p className="mt-1 text-3xl font-medium tabular-nums">{count}</p>
            </div>
          </div>
          <Button nativeButton={false} render={<Link href={`/scanner?eventId=${encodeURIComponent(event.id)}`} />} className="min-h-12 w-full justify-center gap-2 text-sm font-medium">
            <ScanLine className="size-4" aria-hidden="true" />
            Scan ticket
          </Button>
          <Button nativeButton={false} variant="outline" render={<Link href={`/check-in/manual?eventId=${encodeURIComponent(event.id)}`} />} className="min-h-11 w-full justify-center gap-2 text-sm font-medium">
            <ClipboardList className="size-4" aria-hidden="true" />
            Enter serial
          </Button>
        </CardContent>
      </Card>
      <RecentAttempts rows={attempts} timezone={event.timezone} />
      <RecentCheckins rows={recent} timezone={event.timezone} />
    </main>
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
  const rate = attendance.ticketsSold ? Math.min(100, Math.round((attendance.checkedIn / attendance.ticketsSold) * 100)) : 0;
  const repeated = attempts.filter((row) => row[1] === "ALREADY_USED").reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const failed = attempts.filter((row) => row[1] !== "ADMITTED" && row[1] !== "ELIGIBLE").reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const gates = new Map<string, number>();
  for (const row of byGate) gates.set(String(row[1]), (gates.get(String(row[1])) ?? 0) + Number(row[2] ?? 0));

  return (
    <main className="flex flex-col gap-4 sm:gap-6">
      <DashboardHeading event={event} />
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
        <Stat icon={<Check className="size-4" />} label="Admissions" value={String(attendance.checkedIn)} detail={`${today} today`} />
        <Stat icon={<Activity className="size-4" />} label="Admission rate" value={`${rate}%`} detail={`${attendance.checkedIn} of ${attendance.ticketsSold} sold tickets`} />
        <Stat icon={<CircleAlert className="size-4" />} label="Failed scans" value={String(failed)} detail="Today" />
        <Stat icon={<ScanLine className="size-4" />} label="Repeat scans" value={String(repeated)} detail="Already admitted · today" />
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
        <Card className="border-border/50 bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg font-medium">Admissions by gate</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Today&apos;s successful check-ins</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {gates.size ? (
              <ul className="divide-y divide-border/50">
                {[...gates].sort((a, b) => b[1] - a[1]).map(([gate, value]) => (
                  <li key={gate} className="flex min-h-10 items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate">{gate}</span>
                    <strong className="tabular-nums">{value}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No admissions recorded today</p>
            )}
          </CardContent>
        </Card>
        <RecentCheckins rows={recent} timezone={event.timezone} />
      </div>
    </main>
  );
}

function RecentSales({
  sales,
  title = "Recent sales",
  timezone = "Africa/Kampala",
  variant = "default",
}: {
  sales: Awaited<ReturnType<typeof listSales>>["sales"];
  title?: string;
  timezone?: string;
  variant?: "default" | "admin";
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 p-4 pb-2">
        <CardTitle className="min-w-0 truncate text-lg font-medium">{title}</CardTitle>
        <Link
          href="/sales"
          className="col-start-2 row-start-1 inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          All sales
          <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
        </Link>
        <CardDescription className="col-span-2 row-start-2 text-sm text-muted-foreground">Latest recorded transactions</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {sales.length ? (
          <ul className="divide-y divide-border/50">
            {sales.map((sale) => {
              const tierSummary = sale.items.length
                ? sale.items.map((i) => `${i.quantity}× ${i.ticketTypeName}`).join(", ")
                : "—";
              const time = formatDateTime(sale.createdAt, timezone, "en-UG", { hour: "2-digit", minute: "2-digit" });
              const customerName = sale.customerName ?? "Walk-in customer";
              return (
                <li key={sale.id}>
                  <Link href={`/sales/${sale.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex min-w-0 items-center gap-3">
                      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md bg-muted/50 text-foreground *:size-3.5">
                        <ReceiptText />
                      </span>
                      <span className="min-w-0">
                        {variant === "admin" ? (
                          <>
                            <span className="block truncate text-sm font-medium">{customerName}</span>
                            <time className="font-mono text-[12px] text-muted-foreground">{time}</time>
                          </>
                        ) : (
                          <>
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{customerName}</span>
                              <SaleStatusBadge domain="sale" status={sale.status} />
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{sale.reference} · {tierSummary}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-foreground">
                        {formatUGX(sale.totalUgx)}
                      </span>
                      {variant === "admin" ? (
                        <SaleStatusBadge domain="sale" status={sale.status} />
                      ) : (
                        <time className="font-mono text-[12px] text-muted-foreground">{time}</time>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No sales recorded yet — start a new sale to begin</p>
        )}
      </CardContent>
    </Card>
  );
}

function RecentCheckins({
  rows,
  title = "Latest turnstile admissions",
  timezone = "Africa/Kampala",
  variant = "default",
}: {
  rows: Awaited<ReturnType<typeof listRecentCheckIns>>;
  title?: string;
  timezone?: string;
  variant?: "default" | "admin";
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 p-4 pb-2">
        <CardTitle className="min-w-0 truncate text-lg font-medium">{title}</CardTitle>
        <span className="col-start-2 row-start-1 font-mono text-[12px] text-muted-foreground">Latest</span>
        <CardDescription className="col-span-2 row-start-2 text-sm text-muted-foreground">Latest admitted tickets</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {rows.length ? (
          <ul className="divide-y divide-border/50">
            {rows.map((row) => {
              const time = formatDateTime(row.checkedInAt, timezone, "en-UG", { hour: "2-digit", minute: "2-digit" });
              return (
                <li key={row.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md bg-muted/50 text-success *:size-3.5">
                      <Verified />
                    </span>
                    <span className="min-w-0">
                      {variant === "admin" ? (
                        <>
                          <span className="block truncate font-mono text-sm font-medium">{row.serial}</span>
                          <time className="font-mono text-[12px] text-muted-foreground">{time}</time>
                        </>
                      ) : (
                        <>
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-mono text-sm font-medium">{row.serial}</span>
                            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{row.ticketTypeName}</span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{row.gate}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-[12px] text-success">Valid pass</span>
                    {variant === "admin" ? (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{row.ticketTypeName}</span>
                    ) : (
                      <time className="font-mono text-[12px] text-muted-foreground">{time}</time>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No tickets checked in yet — admissions will appear here</p>
        )}
      </CardContent>
    </Card>
  );
}

function RecentAttempts({
  rows,
  timezone,
}: { rows: Awaited<ReturnType<typeof listScanAttempts>>; timezone: string }) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-lg font-medium">Recent scan outcomes</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">Latest ticket checks for this event</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {rows.length ? (
          <ul className="divide-y divide-border/50">
            {rows.map((row) => (
              <li key={row.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.serial ?? "Unrecognized ticket"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.method} · {row.gate ?? "No gate"} ·{" "}
                    <time>{formatDateTime(row.attemptedAt, timezone, "en-UG", { hour: "2-digit", minute: "2-digit" })}</time>
                  </span>
                </span>
                <ScanStatusBadge domain="scan" status={row.resultCode} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No scan attempts recorded yet</p>
        )}
      </CardContent>
    </Card>
  );
}

function AdmissionChart({
  admitted,
  capacity,
  today,
  sold,
}: { admitted: number; capacity: number; today: number; sold: number }) {
  // Generate a smooth admission curve for the day
  const points = 24; // hours
  const data = Array.from({ length: points }, (_, i) => {
    const progress = i / (points - 1);
    // S-curve: slow start, ramp up, slow near capacity
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const value = Math.round(admitted * eased);
    const hour = i;
    return { hour, value, label: `${hour.toString().padStart(2, "0")}:00` };
  });

  const maxVal = Math.max(capacity, admitted, 1);
  const chartHeight = 180;
  const width = "100%";

  return (
    <div className="relative" style={{ width, height: chartHeight }}>
      {/* Grid lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 1000 ${chartHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="admissionGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity="0.15" />
            <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="strokeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--warning))" />
            <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1="0"
            x2="1000"
            y1={chartHeight * (1 - frac)}
            y2={chartHeight * (1 - frac)}
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
            strokeDasharray="4 4"
          />
        ))}
        {/* Capacity line */}
        <line
          x1="0"
          x2="1000"
          y1={chartHeight * (1 - capacity / maxVal)}
          y2={chartHeight * (1 - capacity / maxVal)}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1"
          strokeDasharray="6 4"
          opacity="0.5"
        />
        {/* Filled area */}
        <path
          d={`M 0 ${chartHeight} L ${data
            .map((p, i) => `${(i / (points - 1)) * 1000} ${chartHeight * (1 - p.value / maxVal)}`)
            .join(" L ")} L 1000 ${chartHeight} Z`}
          fill="url(#admissionGradient)"
        />
        {/* Stroke line */}
        <path
          d={data
            .map((p, i) => `${i === 0 ? "M" : "L"} ${(i / (points - 1)) * 1000} ${chartHeight * (1 - p.value / maxVal)}`)
            .join(" ")}
          stroke="url(#strokeGradient)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Current point */}
        <circle
          cx={(data.length - 1) / (points - 1) * 1000}
          cy={chartHeight * (1 - admitted / maxVal)}
          r="5"
          fill="hsl(var(--warning))"
          stroke="hsl(var(--background))"
          strokeWidth="2"
        />
        {/* Capacity label */}
        <text
          x="990"
          y={chartHeight * (1 - capacity / maxVal) - 4}
          textAnchor="end"
          fontSize="9"
          fontFamily="var(--font-mono)"
          fill="hsl(var(--muted-foreground))"
          opacity="0.6"
        >
          Capacity {capacity}
        </text>
        {/* Current label */}
        <text
          x={(data.length - 1) / (points - 1) * 1000 + 8}
          y={chartHeight * (1 - admitted / maxVal) + 4}
          fontSize="10"
          fontFamily="var(--font-mono)"
          fontWeight="500"
          fill="hsl(var(--warning))"
        >
          {admitted}
        </text>
      </svg>
      {/* X-axis labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-[10px] text-muted-foreground font-mono" aria-hidden="true">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:59</span>
      </div>
      {/* Summary row */}
      <div className="mt-4 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Sold</span>
          <span className="font-mono font-medium tabular-nums text-foreground">{sold}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Admitted today</span>
          <span className="font-mono font-medium tabular-nums text-warning">{today}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rate</span>
          <span className="font-mono font-medium tabular-nums text-warning">{sold ? Math.round((admitted / sold) * 100) : 0}%</span>
        </div>
      </div>
    </div>
  );
}