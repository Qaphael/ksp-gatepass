import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { reportQuerySchema } from "@/lib/validation/reports";
import { listEvents } from "@/server/services/events.service";
import { availableReports, getReport } from "@/server/services/reports.service";

export const instant = false;
type Search = Record<string, string | string[] | undefined>;
function one(params: Search, key: string) { return typeof params[key] === "string" ? params[key] as string : undefined; }
function exportUrl(query: { eventId: string; type: string; from?: string; to?: string }, format: "csv" | "pdf") {
  const search = new URLSearchParams({ eventId: query.eventId, type: query.type, format });
  if (query.from) search.set("from", query.from); if (query.to) search.set("to", query.to);
  return `/api/v1/reports/export?${search.toString()}`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login");
  const catalog = availableReports(ctx);
  if (!catalog.length) redirect("/dashboard");
  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === one(params, "eventId")) ?? events[0];
  const selectedType = one(params, "type") ?? catalog[0]?.type;
  const parsed = event && selectedType ? reportQuerySchema.safeParse({ eventId: event.id, type: selectedType, ...(one(params, "from") ? { from: one(params, "from") } : {}), ...(one(params, "to") ? { to: one(params, "to") } : {}) }) : null;
  const query = parsed?.success ? parsed.data : null;
  const data = query ? await getReport(ctx, query) : null;
  const canExport = can(ctx.role, "report:export-full") || can(ctx.role, "report:export-own");
  return <div className="flex flex-col gap-4">
    <div><h1 className="text-2xl font-semibold tracking-tight">Reports</h1><p className="mt-1 text-sm text-muted-foreground">Event sales, payments, attendance and reconciliation from server records.</p></div>
    <form className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
      <label className="grid min-w-48 flex-1 gap-1 text-sm">Event<select name="eventId" defaultValue={event?.id ?? ""} className="rounded-md border border-input bg-background px-3 py-2">{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid min-w-48 flex-1 gap-1 text-sm">Report<select name="type" defaultValue={selectedType} className="rounded-md border border-input bg-background px-3 py-2">{catalog.map((item) => <option key={item.type} value={item.type}>{item.title}</option>)}</select></label>
      <label className="grid gap-1 text-sm">From<input type="date" name="from" defaultValue={one(params, "from")} className="rounded-md border border-input bg-background px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">To<input type="date" name="to" defaultValue={one(params, "to")} className="rounded-md border border-input bg-background px-3 py-2" /></label>
      <button className="rounded-md border px-3 py-2 text-sm">Run report</button>
    </form>
    {data ? <><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">{data.title}</h2><p className="text-xs text-muted-foreground">{data.eventName} · Values reflect staff-recorded transactions.</p></div>{canExport && query && <div className="flex gap-2"><a className="rounded-md border px-3 py-2 text-sm" href={exportUrl(query, "csv")}>Export CSV</a><a className="rounded-md border px-3 py-2 text-sm" href={exportUrl(query, "pdf")}>Export PDF</a></div>}</div>
      {data.type === "PAYMENTS_BY_METHOD" || data.type === "RECONCILIATION" ? <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">Payments shown were recorded by staff. No bank or mobile-money provider verification is connected. Actual cash counted is not recorded in this system.</p> : null}
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{data.columns.map((column) => <th key={column} className="px-3 py-2 font-medium">{column}</th>)}</tr></thead><tbody>{data.rows.map((row, ri) => <tr key={ri} className="border-t border-border">{row.map((value, ci) => <td key={ci} className="px-3 py-2">{typeof value === "number" && /UGX/.test(data.columns[ci] ?? "") ? new Intl.NumberFormat("en-UG").format(value) : value}</td>)}</tr>)}{data.rows.length === 0 ? <tr><td colSpan={data.columns.length} className="p-8 text-center text-muted-foreground">No records match these filters.</td></tr> : null}</tbody></table></div>
    </> : <p className="rounded-md border p-4 text-sm text-muted-foreground">Choose a valid report and date range.</p>}
  </div>;
}
