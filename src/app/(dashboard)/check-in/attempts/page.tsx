import Link from "next/link";
import { redirect } from "next/navigation";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Serial } from "@/components/ui/serial";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { scanAttemptQuerySchema } from "@/lib/validation/check-in";
import { listEvents } from "@/server/services/events.service";
import { listScanAttempts } from "@/server/services/check-in.service";
import { PageHeader } from "@/components/ui/page-header";

export const instant = false;
const date = (value: string) => new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(value));
export default async function ScanAttemptsPage({ searchParams }: { searchParams: Promise<{ eventId?: string; method?: string; resultCode?: string; before?: string }> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login");
  if (!can(ctx.role, "checkin:read-attempts")) redirect("/dashboard");
  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === params.eventId) ?? events[0];
  const parsed = event ? scanAttemptQuerySchema.safeParse({ eventId: event.id, method: params.method, resultCode: params.resultCode, before: params.before, limit: 100 }) : null;
  const rows = parsed?.success ? await listScanAttempts(ctx, parsed.data) : [];
  const invalidFilters = Boolean(params.method && !["QR", "SERIAL"].includes(params.method)) || Boolean(params.resultCode && !["INVALID_QR", "UNKNOWN_SERIAL", "NOT_PAID", "TICKET_REVOKED", "ALREADY_USED", "ADMITTED", "ELIGIBLE"].includes(params.resultCode));
  const next = rows.length === 100 ? rows[rows.length - 1]?.attemptedAt : undefined;
  const activeCount = [params.eventId, params.method, params.resultCode].filter(Boolean).length;
  return <div className="flex flex-col gap-4"><PageHeader title="Scan Attempts & Security Audit" badge={<span className="inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-2 py-0.5 text-sm font-semibold text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />Security Engine · Active Guard</span>} description="Live gate turnstile telemetry, counterfeit signatures & passback alerts" />
    {rows.length > 0 && <div className="grid max-w-5xl grid-cols-3 gap-3">{(() => { const denied = rows.filter((r) => r.resultCode !== "ADMITTED" && r.resultCode !== "ELIGIBLE").length; const admitted = rows.length - denied; return [["Total attempts", rows.length, "bg-muted"], ["Denied", denied, "bg-warning/10 text-warning"], ["Admitted", admitted, "bg-success/10 text-success"]].map(([label, value, cls]) => <div key={label as string} className="rounded-lg border bg-card p-3"><p className="text-sm text-muted-foreground">{label}</p><p className={`text-xl font-semibold tabular-nums ${cls}`}>{value}</p></div>); })()}</div>}
    {event && <FilterSheet activeCount={activeCount}><form className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap">
      <label className="grid flex-1 gap-1 text-base">Event<Select defaultValue={event.id}><SelectTrigger className="h-12 min-h-12 w-full min-w-0 truncate rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm"><SelectValue /></SelectTrigger><SelectContent>{events.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label>
      <label className="grid flex-1 gap-1 text-base">Method<Select defaultValue={params.method ?? ""}><SelectTrigger className="h-12 min-h-12 w-full min-w-0 truncate rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm"><SelectValue placeholder="All methods" /></SelectTrigger><SelectContent><SelectItem value="QR">QR</SelectItem><SelectItem value="SERIAL">Serial</SelectItem></SelectContent></Select></label>
      <label className="grid flex-1 gap-1 text-base">Result<Select defaultValue={params.resultCode ?? ""}><SelectTrigger className="h-12 min-h-12 w-full min-w-0 truncate rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm"><SelectValue placeholder="All results" /></SelectTrigger><SelectContent>{["INVALID_QR", "UNKNOWN_SERIAL", "NOT_PAID", "TICKET_REVOKED", "ALREADY_USED", "ADMITTED", "ELIGIBLE"].map((code) => <SelectItem key={code} value={code}>{code.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></label>
      <Button type="submit" className="min-h-12 rounded-control border border-border bg-background px-4 text-base">Apply</Button>
    </form></FilterSheet>}
    {invalidFilters && <p className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-base" role="status">Some filter values were invalid. Choose a valid method or result and apply again.</p>}
    <ResponsiveList cards={rows.map((row) => <article key={row.id} className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><time className="text-sm text-muted-foreground">{date(row.attemptedAt)}</time><p className="mt-1 font-medium">{row.serial ? <Serial>{row.serial}</Serial> : "Unknown ticket"}</p></div><StatusBadge domain="scan" status={row.resultCode} /></div><p className="mt-3 text-sm">{row.method} · {row.gate ?? "No gate"}</p><p className="text-sm text-muted-foreground">{row.actor.displayName}</p></article>)} table={<div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr>{["Time", "Method", "Ticket", "Gate", "Result", "Staff"].map((x) => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2">{date(row.attemptedAt)}</td><td className="px-3 py-2">{row.method}</td><td className="px-3 py-2">{row.serial ? <Serial>{row.serial}</Serial> : "Unknown"}</td><td className="px-3 py-2">{row.gate ?? "—"}</td><td className="px-3 py-2"><StatusBadge domain="scan" status={row.resultCode} /></td><td className="px-3 py-2">{row.actor.displayName}</td></tr>)}</tbody></table></div>} />
    {rows.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-base text-muted-foreground">No scan attempts match these filters.</p>}
    {next && event && <Link className="inline-flex min-h-12 items-center justify-center rounded-md border px-4 md:hidden" href={`/check-in/attempts?${new URLSearchParams({ eventId: event.id, ...(params.method ? { method: params.method } : {}), ...(params.resultCode ? { resultCode: params.resultCode } : {}), before: next })}`}>Load more</Link>}
  </div>;
}
