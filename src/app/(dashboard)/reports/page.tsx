import { redirect } from "next/navigation";
import { connection } from "next/server";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { Money } from "@/components/ui/money";
import { StatTile } from "@/components/ui/stat-tile";
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

type Cell = string | number | null;

/** Money only accepts safe integers; anything else falls back to plain text. */
function isMoneyCell(value: Cell | undefined, column: string | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && /UGX/i.test(column ?? "");
}

function renderCell(value: Cell | undefined, column: string | undefined) {
  return isMoneyCell(value, column) ? <Money amount={value} /> : String(value ?? "—");
}

/** Read a labelled measure row (e.g. "Net recorded payments (UGX)"); null when absent. */
function reportNumber(rows: Cell[][], label: string): number | null {
  const value = rows.find((row) => row[0] === label)?.[1];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** Sum one numeric column across rows; null when the column is missing or empty. */
function columnSum(rows: Cell[][], columns: string[], label: string): number | null {
  const index = columns.indexOf(label);
  if (index < 0) return null;
  let total = 0;
  let seen = false;
  for (const row of rows) {
    const value = row[index];
    if (typeof value === "number" && Number.isSafeInteger(value)) { total += value; seen = true; }
  }
  return seen ? total : null;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  MOBILE_MONEY: "Mobile money",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  OTHER: "Other",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const ctx = await getSessionContext(); if (!ctx) redirect("/login");
  const catalog = availableReports(ctx); if (!catalog.length) redirect("/dashboard");
  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === one(params, "eventId")) ?? events[0];
  const selectedType = one(params, "type") ?? catalog[0]?.type;
  const parsed = event && selectedType ? reportQuerySchema.safeParse({ eventId: event.id, type: selectedType, ...(one(params, "from") ? { from: one(params, "from") } : {}), ...(one(params, "to") ? { to: one(params, "to") } : {}) }) : null;
  const query = parsed?.success ? parsed.data : null; const data = query ? await getReport(ctx, query) : null;
  const canExport = can(ctx.role, "report:export-full") || can(ctx.role, "report:export-own");
  const activeCount = [one(params, "eventId"), one(params, "type"), one(params, "from"), one(params, "to")].filter(Boolean).length;

  // Summary strip for the reconciliation-style reports, built from the loaded rows.
  const summaryTiles = data && (data.type === "RECONCILIATION" || data.type === "PAYMENTS_BY_METHOD")
    ? [
        {
          label: data.type === "RECONCILIATION" ? "Gross sales" : "Gross recorded",
          value: data.type === "RECONCILIATION"
            ? reportNumber(data.rows, "Gross sales value (UGX)")
            : columnSum(data.rows, data.columns, "Payments recorded UGX"),
        },
        {
          label: "Net recorded payments",
          value: data.type === "RECONCILIATION"
            ? reportNumber(data.rows, "Net recorded payments (UGX)")
            : columnSum(data.rows, data.columns, "Net recorded UGX"),
        },
        {
          label: "Outstanding",
          value: data.type === "RECONCILIATION" ? reportNumber(data.rows, "Outstanding balances (UGX)") : null,
        },
      ].filter((tile): tile is { label: string; value: number } => tile.value !== null)
    : [];

  // Payment channel rows (PAYMENTS_BY_METHOD): one row per method, mobile money is a single row.
  const channelColumn = data?.type === "PAYMENTS_BY_METHOD" ? data.columns.indexOf("Net recorded UGX") : -1;
  const channels = data?.type === "PAYMENTS_BY_METHOD" && channelColumn >= 0
    ? data.rows.map((row) => ({
        key: String(row[0] ?? "—"),
        label: METHOD_LABELS[String(row[0] ?? "")] ?? String(row[0] ?? "—").replaceAll("_", " ").toLowerCase(),
        amount: typeof row[channelColumn] === "number" && Number.isSafeInteger(row[channelColumn]) ? (row[channelColumn] as number) : null,
      }))
    : [];

  return <div className="flex flex-col gap-4">
    <PageHeader title="Reports" description="Event sales, payments, attendance and reconciliation from server records." />
    <FilterSheet activeCount={activeCount}><form className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 md:rounded-lg md:border md:border-border/70 md:bg-card md:p-4 md:shadow-card lg:p-5">
      <label className="grid min-w-0 gap-1.5 text-sm font-semibold">Event<select name="eventId" defaultValue={event?.id ?? ""} className="block h-12 min-h-12 w-full min-w-0 truncate rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm">{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid min-w-0 gap-1.5 text-sm font-semibold">Report<select name="type" defaultValue={selectedType} className="block h-12 min-h-12 w-full min-w-0 truncate rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm">{catalog.map((item) => <option key={item.type} value={item.type}>{item.title}</option>)}</select></label>
      <label className="grid min-w-0 gap-1.5 text-sm font-semibold">From<input type="date" name="from" defaultValue={one(params, "from")} className="block h-12 min-h-12 w-full min-w-0 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm" /></label>
      <label className="grid min-w-0 gap-1.5 text-sm font-semibold">To<input type="date" name="to" defaultValue={one(params, "to")} className="block h-12 min-h-12 w-full min-w-0 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm" /></label>
      <Button type="submit" className="h-12 min-h-12 w-full self-end md:col-span-2 md:w-auto md:justify-self-end lg:col-span-4 lg:justify-self-end">Run report</Button>
    </form></FilterSheet>
    {data ? <><section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border/70 bg-card p-4 shadow-card sm:p-5"><div className="min-w-0"><h2 className="text-xl font-semibold">{data.title}</h2><p className="mt-1 text-sm text-muted-foreground">{data.eventName} · Values reflect staff-recorded transactions.</p></div>{canExport && query && <div className="flex shrink-0 gap-2"><a className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control border border-border bg-background px-4 text-sm font-semibold hover:bg-muted" href={exportUrl(query, "csv")}>Export CSV</a><a className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control border border-border bg-background px-4 text-sm font-semibold hover:bg-muted" href={exportUrl(query, "pdf")}>Export PDF</a></div>}</section>
      {data.type === "PAYMENTS_BY_METHOD" || data.type === "RECONCILIATION" ? <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-base">Payments shown were recorded by staff. No bank or mobile-money provider verification is connected. Actual cash counted is not recorded in this system.</p> : null}
      {summaryTiles.length ? (() => {
        const gross = summaryTiles.find((tile) => tile.label === "Gross sales" || tile.label === "Gross recorded")?.value ?? null;
        const share = (value: number) => (gross && gross > 0 ? Math.round((value / gross) * 100) : undefined);
        return (
          <section aria-label="Report summary" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            {summaryTiles.map((tile) => {
              const percent = share(tile.value);
              return (
                <StatTile
                  key={tile.label}
                  label={tile.label}
                  value={formatSummary(tile.value)}
                  sub={percent === undefined ? undefined : `${percent}% of gross recorded`}
                  percent={tile.label === "Net recorded payments" || tile.label === "Outstanding" ? percent : undefined}
                />
              );
            })}
          </section>
        );
      })() : null}
      {channels.length ? (() => {
        const channelTotal = channels.reduce((sum, channel) => sum + (channel.amount ?? 0), 0);
        const dotColors = ["bg-primary", "bg-tertiary", "bg-success", "bg-muted-foreground"];
        return (
          <section aria-label="Payment channels" className="rounded-lg border border-border/70 bg-card p-4 shadow-card">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Payment channel breakdown</h3>
                <p className="text-sm text-muted-foreground">Net recorded amount per channel, from staff-recorded payments.</p>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">Recorded total: <Money amount={channelTotal} /></span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {channels.map((channel, index) => (
                <div key={channel.key} className="flex min-w-0 flex-col gap-1 rounded-lg bg-muted/40 p-3">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-sm ${dotColors[index % dotColors.length]}`} />
                    <span className="truncate font-mono text-[11px] text-foreground">{channel.label}</span>
                  </span>
                  <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                    {channel.amount === null ? "—" : <Money amount={channel.amount} />}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {channel.amount === null || channelTotal <= 0 ? "No recorded share" : `${Math.round((channel.amount / channelTotal) * 100)}% of recorded`}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Net of reversals and refunds. Mobile money is shown as a single channel.</p>
          </section>
        );
      })() : null}
      {data.rows.length === 0 ? <p className="rounded-lg border border-dashed bg-card p-8 text-center text-base text-muted-foreground">No records match these filters.</p> : <ResponsiveList cards={data.rows.map((row, ri) => <article key={ri} className="rounded-lg border border-border/70 bg-card p-4 shadow-card"><dl className="grid gap-3">{row.map((value, ci) => <div key={ci} className="flex min-w-0 justify-between gap-4 border-b border-border/70 pb-2 last:border-0 last:pb-0"><dt className="text-sm text-muted-foreground">{data.columns[ci]}</dt><dd className="min-w-0 break-words text-right text-base font-medium">{renderCell(value, data.columns[ci])}</dd></div>)}</dl></article>)} table={<div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-card"><Table className="min-w-[720px] table-auto text-sm">
        <caption className="sr-only">{data.title} for {data.eventName}</caption>
        <TableHeader className="bg-muted/70"><TableRow className="border-b border-border hover:bg-transparent">{data.columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{data.rows.map((row, ri) => <TableRow key={ri} className="hover:bg-accent/30">{row.map((value, ci) => <TableCell key={ci} className="max-w-[24rem] whitespace-normal break-words py-3">{renderCell(value, data.columns[ci])}</TableCell>)}</TableRow>)}</TableBody>
      </Table></div>} />}
    </> : <p className="rounded-md border p-4 text-base text-muted-foreground">Choose a valid report and date range.</p>}
  </div>;
}

/** Summary values are integer UGX; anything else is shown as text rather than thrown. */
function formatSummary(value: number): string {
  if (!Number.isSafeInteger(value)) return String(value);
  return `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(value)}`;
}
