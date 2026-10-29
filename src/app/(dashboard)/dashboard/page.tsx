import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowRight, Banknote, CalendarDays, Check, CircleAlert, ClipboardList, Plus, ScanLine, Ticket, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventPoster } from "@/components/events/event-poster";
import { OpenBadge, StatusBadge } from "@/components/events/status-badges";
import { StatusBadge as ScanStatusBadge } from "@/components/ui/status-badge";
import { DashboardConnection } from "@/components/check-in/dashboard-connection";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/role";
import { listEvents, type EventDto } from "@/server/services/events.service";
import { getReport } from "@/server/services/reports.service";
import { listSales } from "@/server/services/sales.service";
import { getAttendanceSummary, listRecentCheckIns, listScanAttempts } from "@/server/services/check-in.service";
import { getDailyAdmissionCount, getSellerDashboardMetrics } from "@/server/services/dashboard.service";

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

function money(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(value)}`;
}

function EmptyDashboard({ role }: { role: "ADMIN" | "SELLER" | "VERIFIER" | "SUPERVISOR" }) {
  return <section className="mx-auto flex min-h-[55dvh] max-w-lg flex-col justify-center gap-4 text-center">
    <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700"><CalendarDaysIcon /></div>
    <div><h1 className="text-2xl font-semibold">No event is ready</h1><p className="mt-2 text-base text-muted-foreground">An administrator needs to configure an event before your {ROLE_LABELS[role].toLowerCase()} dashboard can show event activity.</p></div>
    {role === "ADMIN" && <Button nativeButton={false} render={<Link href="/events/new" />}>Create event <ArrowRight /></Button>}
  </section>;
}

function CalendarDaysIcon() { return <CalendarDays className="size-7" aria-hidden="true" />; }

function DashboardHeading({ event, eyebrow = "Event overview" }: { event: EventDto; eyebrow?: string }) {
  return <div className="flex min-w-0 flex-col gap-2">
    {event.branding.poster && <>
      <EventPoster poster={event.branding.poster} variant="display" className="max-h-[60dvh] md:hidden" />
      <EventPoster poster={event.branding.poster} variant="banner" className="hidden md:block" />
      <a href={`${event.branding.poster.displayUrl}&download=1`} className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-primary underline underline-offset-4">Download poster</a>
    </>}
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0"><p className="text-sm font-medium text-muted-foreground">{eyebrow}</p><h1 className="truncate text-2xl font-semibold tracking-tight">{event.name}</h1><p className="truncate text-sm text-muted-foreground">{event.eventDate} · {event.venue}</p></div>
      <div className="ml-auto flex shrink-0 flex-col items-end gap-1"><StatusBadge status={event.status} /><OpenBadge open={event.admissionOpen} label="Admission" /></div>
    </div>
  </div>;
}

function Stat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return <Card><CardContent className="p-3 sm:p-4"><div className="flex items-center gap-2 text-muted-foreground"><span aria-hidden="true" className="*:size-4">{icon}</span><span className="text-xs font-medium sm:text-sm">{label}</span></div><p className="mt-2 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</CardContent></Card>;
}

function AdminDashboard({ event, stats, sales, checkins, alerts }: { event: EventDto; stats: { sold: number; paidUgx: number; outstandingUgx: number; checkedIn: number; remaining: number; capacity: number; today: number }; sales: Awaited<ReturnType<typeof listSales>>["sales"]; checkins: Awaited<ReturnType<typeof listRecentCheckIns>>; alerts: { balances: number; failed: number; revoked: number; configuration: boolean } }) {
  return <main className="flex flex-col gap-4 sm:gap-6">
    <DashboardHeading event={event} />
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
      <Stat icon={<Ticket />} label="Tickets sold" value={String(stats.sold)} detail={`of ${stats.capacity} capacity`} />
      <Stat icon={<Banknote />} label="Paid" value={money(stats.paidUgx)} />
      <Stat icon={<Wallet />} label="Outstanding" value={money(stats.outstandingUgx)} />
      <Stat icon={<Check />} label="Checked in" value={String(stats.checkedIn)} detail={`${stats.today} today`} />
      <Stat icon={<Users />} label="Remaining" value={String(stats.remaining)} detail="sold, not admitted" />
    </div>
    {(alerts.balances > 0 || alerts.failed > 0 || alerts.revoked > 0 || alerts.configuration) && <section aria-label="Event alerts" className="flex flex-wrap items-center gap-2 rounded-xl border border-warning bg-warning/10 p-3 text-sm">
      <CircleAlert className="size-5 shrink-0 text-warning-foreground" aria-hidden="true" /><strong>Needs attention</strong>
      {alerts.balances > 0 && <Badge variant="outline">{alerts.balances} open balances</Badge>}{alerts.failed > 0 && <Badge variant="outline">{alerts.failed} unsuccessful scans today</Badge>}{alerts.revoked > 0 && <Badge variant="outline">{alerts.revoked} revoked tickets</Badge>}{alerts.configuration && <Badge variant="outline">No ticket categories configured</Badge>}
    </section>}
    <div className="grid gap-3 lg:grid-cols-2">
    <RecentSales sales={sales} /><RecentCheckins rows={checkins} timezone={event.timezone} />
    </div>
    <QuickActions event={event} admin />
  </main>;
}

function SellerDashboard({ event, metrics, recent, outstandingRows }: { event: EventDto; metrics: Awaited<ReturnType<typeof getSellerDashboardMetrics>>; recent: Awaited<ReturnType<typeof listSales>>["sales"]; outstandingRows: number }) {
  return <main className="flex flex-col gap-4 sm:gap-6">
    <DashboardHeading event={event} eyebrow="Seller overview" />
    <Button nativeButton={false} render={<Link href={`/sales/new?eventId=${encodeURIComponent(event.id)}`} />} className="min-h-14 w-full justify-center text-lg"><Plus aria-hidden="true" />New sale</Button>
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <Stat icon={<Ticket />} label="Sales today" value={String(metrics.salesCount)} />
      <Stat icon={<Banknote />} label="Sales value" value={money(metrics.salesValueUgx)} detail="Today · UGX" />
      <Stat icon={<Banknote />} label="Received net today" value={money(metrics.receivedNetUgx)} detail="Recorded payments less adjustments" />
      <Stat icon={<Wallet />} label="Outstanding" value={money(metrics.outstandingUgx)} detail={`${outstandingRows} customer ${outstandingRows === 1 ? "balance" : "balances"}`} />
    </div>
    <RecentSales sales={recent} title="Recent transactions" />
  </main>;
}

function VerifierDashboard({ event, count, day, recent, attempts }: { event: EventDto; count: number; day: string; recent: Awaited<ReturnType<typeof listRecentCheckIns>>; attempts: Awaited<ReturnType<typeof listScanAttempts>> }) {
  return <main className="mx-auto flex w-full max-w-xl flex-col gap-4 sm:gap-6">
    <DashboardHeading event={event} eyebrow="Gate overview" />
    <DashboardConnection eventId={event.id} />
    <Card className="border-brand-700 bg-brand-900 text-white"><CardContent className="flex flex-col gap-4 p-5 sm:p-6"><div><p className="text-sm text-white/75">Successful check-ins · {day}</p><p className="mt-1 text-4xl font-bold tabular-nums">{count}</p></div><Button nativeButton={false} render={<Link href={`/scanner?eventId=${encodeURIComponent(event.id)}`} />} className="min-h-16 w-full justify-center bg-white text-brand-900 hover:bg-white/90"><ScanLine aria-hidden="true" />Scan ticket</Button><Button nativeButton={false} variant="outline" render={<Link href={`/check-in/manual?eventId=${encodeURIComponent(event.id)}`} />} className="min-h-14 w-full justify-center border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"><ClipboardList aria-hidden="true" />Enter serial</Button></CardContent></Card>
    <RecentAttempts rows={attempts} timezone={event.timezone} />
    <RecentCheckins rows={recent} timezone={event.timezone} />
  </main>;
}

function SupervisorDashboard({ event, attendance, today, attempts, byGate, recent }: { event: EventDto; attendance: Awaited<ReturnType<typeof getAttendanceSummary>>; today: number; attempts: (string | number | null)[][]; byGate: (string | number | null)[][]; recent: Awaited<ReturnType<typeof listRecentCheckIns>> }) {
  const rate = attendance.ticketsSold ? Math.min(100, Math.round((attendance.checkedIn / attendance.ticketsSold) * 100)) : 0;
  const repeated = attempts.filter((row) => row[1] === "ALREADY_USED").reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const failed = attempts.filter((row) => row[1] !== "ADMITTED" && row[1] !== "ELIGIBLE").reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
  const gates = new Map<string, number>();
  for (const row of byGate) gates.set(String(row[1]), (gates.get(String(row[1])) ?? 0) + Number(row[2] ?? 0));
  return <main className="flex flex-col gap-4 sm:gap-6">
    <DashboardHeading event={event} eyebrow="Supervisor overview" />
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"><Stat icon={<Check />} label="Admissions" value={String(attendance.checkedIn)} detail={`${today} today`} /><Stat icon={<Activity />} label="Admission rate" value={`${rate}%`} detail={`${attendance.checkedIn} of ${attendance.ticketsSold} sold tickets`} /><Stat icon={<CircleAlert />} label="Failed scans" value={String(failed)} detail="Today" /><Stat icon={<ScanLine />} label="Repeat scans" value={String(repeated)} detail="Already admitted · today" /></div>
    <div className="grid gap-3 lg:grid-cols-2"><Card><CardHeader><CardTitle>Admissions by gate</CardTitle><CardDescription>Today&apos;s successful check-ins</CardDescription></CardHeader><CardContent>{gates.size ? <ul className="divide-y divide-border">{[...gates].sort((a, b) => b[1] - a[1]).map(([gate, value]) => <li key={gate} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"><span className="truncate">{gate}</span><strong className="tabular-nums">{value}</strong></li>)}</ul> : <p className="text-sm text-muted-foreground">No admissions recorded today.</p>}</CardContent></Card><RecentCheckins rows={recent} timezone={event.timezone} /></div>
  </main>;
}

function RecentSales({ sales, title = "Recent sales" }: { sales: Awaited<ReturnType<typeof listSales>>["sales"]; title?: string }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between gap-2"><div><CardTitle>{title}</CardTitle><CardDescription>Latest recorded transactions</CardDescription></div><Link href="/sales" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline underline-offset-4">All sales <ArrowRight className="size-4" /></Link></CardHeader><CardContent>{sales.length ? <ul className="divide-y divide-border">{sales.map((sale) => <li key={sale.id}><Link href={`/sales/${sale.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0"><span className="block truncate text-sm font-medium">{sale.customerName ?? sale.reference}</span><span className="block text-xs text-muted-foreground">{sale.reference} · {sale.status.replaceAll("_", " ")}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums">{money(sale.totalUgx)}</span></Link></li>)}</ul> : <p className="text-sm text-muted-foreground">No sales recorded yet.</p>}</CardContent></Card>;
}

function RecentCheckins({ rows, title = "Recent check-ins", timezone = "Africa/Kampala" }: { rows: Awaited<ReturnType<typeof listRecentCheckIns>>; title?: string; timezone?: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>Latest admitted tickets</CardDescription></CardHeader><CardContent>{rows.length ? <ul className="divide-y divide-border">{rows.map((row) => <li key={row.id} className="flex min-h-14 items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate font-mono text-sm font-semibold tracking-wide">{row.serial}</span><span className="block truncate text-xs text-muted-foreground">{row.ticketTypeName} · {row.gate}</span></span><time className="shrink-0 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-UG", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(row.checkedInAt))}</time></li>)}</ul> : <p className="text-sm text-muted-foreground">No tickets checked in yet.</p>}</CardContent></Card>;
}

function RecentAttempts({ rows, timezone }: { rows: Awaited<ReturnType<typeof listScanAttempts>>; timezone: string }) {
  return <Card><CardHeader><CardTitle>Recent scan outcomes</CardTitle><CardDescription>Latest ticket checks for this event</CardDescription></CardHeader><CardContent>{rows.length ? <ul className="divide-y divide-border">{rows.map((row) => {
    return <li key={row.id} className="flex min-h-14 items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{row.serial ?? "Unrecognized ticket"}</span><span className="block truncate text-xs text-muted-foreground">{row.method} · {row.gate ?? "No gate"} · <time>{new Intl.DateTimeFormat("en-UG", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(row.attemptedAt))}</time></span></span><ScanStatusBadge domain="scan" status={row.resultCode} /></li>;
  })}</ul> : <p className="text-sm text-muted-foreground">No scan attempts recorded yet.</p>}</CardContent></Card>;
}

function QuickActions({ event, admin = false }: { event: EventDto; admin?: boolean }) {
  return <section aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><Button nativeButton={false} render={<Link href={`/sales/new?eventId=${encodeURIComponent(event.id)}`} />} className="min-h-12"><Plus aria-hidden="true" />New sale</Button><Button nativeButton={false} variant="outline" render={<Link href={`/scanner?eventId=${encodeURIComponent(event.id)}`} />} className="min-h-12"><ScanLine aria-hidden="true" />Check-in</Button>{admin && <><Button nativeButton={false} variant="outline" render={<Link href={`/reports?eventId=${encodeURIComponent(event.id)}`} />} className="min-h-12"><Activity aria-hidden="true" />Reports</Button><Button nativeButton={false} variant="outline" render={<Link href="/team" />} className="min-h-12"><Users aria-hidden="true" />Team</Button></>}</section>;
}
