import { redirect } from "next/navigation";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { Money } from "@/components/ui/money";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { reportQuerySchema } from "@/lib/validation/reports";
import { listEvents } from "@/server/services/events.service";
import { availableReports, getReport } from "@/server/services/reports.service";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const instant = false;
type Search = Record<string, string | string[] | undefined>;
function one(params: Search, key: string) { return typeof params[key] === "string" ? params[key] as string : undefined; }
function exportUrl(query: { eventId: string; type: string; from?: string; to?: string }, format: "csv" | "pdf") { const search = new URLSearchParams({ eventId: query.eventId, type: query.type, format }); if (query.from) search.set("from", query.from); if (query.to) search.set("to", query.to); return `/api/v1/reports/export?${search.toString()}`; }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login");
  const catalog = availableReports(ctx); if (!catalog.length) redirect("/dashboard");
  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === one(params, "eventId")) ?? events[0];
  const selectedType = one(params, "type") ?? catalog[0]?.type;
  const parsed = event && selectedType ? reportQuerySchema.safeParse({ eventId: event.id, type: selectedType, ...(one(params, "from") ? { from: one(params, "from") } : {}), ...(one(params, "to") ? { to: one(params, "to") } : {}) }) : null;
  const query = parsed?.success ? parsed.data : null; const data = query ? await getReport(ctx, query) : null;
  const canExport = can(ctx.role, "report:export-full") || can(ctx.role, "report:export-own");
  const activeCount = [one(params, "eventId"), one(params, "type"), one(params, "from"), one(params, "to")].filter(Boolean).length;
  return <div className="flex flex-col gap-4">
    <PageHeader title="Reports" description="Event sales, payments, attendance and reconciliation from server records." />
    <FilterSheet activeCount={activeCount}><form className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 md:rounded-[18px] md:border md:border-border/70 md:bg-card md:p-4 md:shadow-card lg:p-5">
      <label className="grid gap-1.5 text-sm font-semibold">Event<select name="eventId" defaultValue={event?.id ?? ""} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm">{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-semibold">Report<select name="type" defaultValue={selectedType} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm">{catalog.map((item) => <option key={item.type} value={item.type}>{item.title}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-semibold">From<input type="date" name="from" defaultValue={one(params, "from")} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm" /></label>
      <label className="grid gap-1.5 text-sm font-semibold">To<input type="date" name="to" defaultValue={one(params, "to")} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm" /></label>
      <Button type="submit" className="min-h-12 w-full self-end md:w-auto lg:col-span-4 lg:justify-self-end">Run report</Button>
    </form></FilterSheet>
    {data ? <><section className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-border/70 bg-card p-4 shadow-card sm:p-5"><div className="min-w-0"><h2 className="text-xl font-semibold tracking-tight">{data.title}</h2><p className="mt-1 text-sm text-muted-foreground">{data.eventName} · Values reflect staff-recorded transactions.</p></div>{canExport && query && <div className="flex shrink-0 gap-2"><a className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control border border-border bg-background px-4 text-sm font-semibold hover:bg-muted" href={exportUrl(query, "csv")}>Export CSV</a><a className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control border border-border bg-background px-4 text-sm font-semibold hover:bg-muted" href={exportUrl(query, "pdf")}>Export PDF</a></div>}</section>
      {data.type === "PAYMENTS_BY_METHOD" || data.type === "RECONCILIATION" ? <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-base">Payments shown were recorded by staff. No bank or mobile-money provider verification is connected. Actual cash counted is not recorded in this system.</p> : null}
      {data.rows.length === 0 ? <p className="rounded-[18px] border border-dashed bg-card p-8 text-center text-base text-muted-foreground">No records match these filters.</p> : <ResponsiveList cards={data.rows.map((row, ri) => <article key={ri} className="rounded-[18px] border border-border/70 bg-card p-4 shadow-card"><dl className="grid gap-3">{row.map((value, ci) => <div key={ci} className="flex min-w-0 justify-between gap-4 border-b border-border/70 pb-2 last:border-0 last:pb-0"><dt className="text-sm text-muted-foreground">{data.columns[ci]}</dt><dd className="min-w-0 break-words text-right text-base font-medium">{typeof value === "number" && /UGX/i.test(data.columns[ci] ?? "") ? <Money amount={value} /> : String(value ?? "—")}</dd></div>)}</dl></article>)} table={<div className="overflow-hidden rounded-[18px] border border-border/70 bg-card shadow-card"><Table className="min-w-[720px] table-auto text-sm">
        <caption className="sr-only">{data.title} for {data.eventName}</caption>
        <TableHeader className="bg-muted/70"><TableRow className="border-b border-border hover:bg-transparent">{data.columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{data.rows.map((row, ri) => <TableRow key={ri} className="hover:bg-accent/30">{row.map((value, ci) => <TableCell key={ci} className="max-w-[24rem] whitespace-normal break-words py-3">{typeof value === "number" && /UGX/i.test(data.columns[ci] ?? "") ? <Money amount={value} /> : String(value ?? "—")}</TableCell>)}</TableRow>)}</TableBody>
      </Table></div>} />}
    </> : <p className="rounded-md border p-4 text-base text-muted-foreground">Choose a valid report and date range.</p>}
  </div>;
}
