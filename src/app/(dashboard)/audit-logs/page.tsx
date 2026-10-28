import { redirect } from "next/navigation";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { auditLogQuerySchema } from "@/lib/validation/reports";
import { listEvents } from "@/server/services/events.service";
import { listAuditLogs } from "@/server/services/audit.service";
import { listUsers } from "@/server/services/users.service";

export const instant = false;
type Search = Record<string, string | string[] | undefined>;
const one = (params: Search, key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
const when = (value: string) => new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(value));
function pageUrl(params: Search, page: number) {
  const search = new URLSearchParams();
  for (const key of ["eventId", "actorId", "action", "outcome", "q", "from", "to"]) { const value = one(params, key); if (value) search.set(key, value); }
  search.set("page", String(page)); return `/audit-logs?${search.toString()}`;
}

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login");
  if (!can(ctx.role, "audit:read")) redirect("/dashboard");
  const [events, users, params] = await Promise.all([listEvents(ctx), listUsers(ctx), searchParams]);
  const parsed = auditLogQuerySchema.safeParse(Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string")));
  const query = parsed.success ? parsed.data : auditLogQuerySchema.parse({});
  const result = await listAuditLogs(ctx, query);
  const activeCount = [query.eventId, query.actorId, query.action, query.q, query.outcome, query.from, query.to].filter(Boolean).length;
  const cards = result.logs.map((entry) => <article key={entry.id} className="rounded-xl border bg-card p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{entry.action.replaceAll("_", " ")}</p><time className="text-sm text-muted-foreground">{when(entry.createdAt)}</time></div><span className={entry.outcome === "SUCCESS" ? "inline-flex min-h-7 items-center rounded-full border border-success/40 bg-success/10 px-2 text-sm font-medium text-success-foreground" : "inline-flex min-h-7 items-center rounded-full border border-danger/40 bg-danger/10 px-2 text-sm font-medium text-danger-foreground"}>{entry.outcome === "SUCCESS" ? "✓ Success" : "✕ Failure"}</span></div>
    <p className="mt-3 text-sm">{entry.actor?.displayName ?? (entry.actorId ? "Inactive account" : "Unauthenticated")} · {entry.actorRole ?? "No role"}</p>
    <p className="text-sm text-muted-foreground">{entry.targetType ?? "No target"}{entry.eventName ? ` · ${entry.eventName}` : ""}</p>
    <details className="mt-2 text-sm"><summary className="min-h-11 cursor-pointer py-2">Change summary</summary><pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm">{entry.summary === null ? "No summary" : JSON.stringify(entry.summary, null, 2)}</pre></details>
  </article>);
  return <div className="flex flex-col gap-4">
    <div><h1 className="text-2xl font-semibold tracking-tight">Audit log</h1><p className="mt-1 text-sm text-muted-foreground">Search critical actions with actor, event, outcome and safe change summaries.</p></div>
    {!parsed.success && <p className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm" role="status">Some filter values were invalid and have been reset. Update the filters and search again.</p>}
    <FilterSheet activeCount={activeCount}><form className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm">Event<select name="eventId" defaultValue={query.eventId ?? ""} className="min-h-12 rounded-md border border-input bg-background px-3 text-base"><option value="">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Actor<select name="actorId" defaultValue={query.actorId ?? ""} className="min-h-12 rounded-md border border-input bg-background px-3 text-base"><option value="">All actors</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.username}{user.active ? "" : " (inactive)"}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Action<input name="action" defaultValue={query.action} placeholder="sale, auth, ticket…" className="min-h-12 rounded-md border border-input bg-background px-3 text-base" /></label>
      <label className="grid gap-1 text-sm">Target or ID<input name="q" defaultValue={query.q} className="min-h-12 rounded-md border border-input bg-background px-3 text-base" /></label>
      <label className="grid gap-1 text-sm">Outcome<select name="outcome" defaultValue={query.outcome ?? ""} className="min-h-12 rounded-md border border-input bg-background px-3 text-base"><option value="">All</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option></select></label>
      <label className="grid gap-1 text-sm">From<input type="date" name="from" defaultValue={query.from} className="min-h-12 rounded-md border border-input bg-background px-3 text-base" /></label>
      <label className="grid gap-1 text-sm">To<input type="date" name="to" defaultValue={query.to} className="min-h-12 rounded-md border border-input bg-background px-3 text-base" /></label>
      <button className="min-h-12 rounded-md border px-4 text-base">Search</button>
    </form></FilterSheet>
    <ResponsiveList cards={cards} table={<div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{["Time", "Actor", "Action", "Target", "Event", "Outcome", "Summary"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{result.logs.map((entry) => <tr key={entry.id} className="border-t border-border align-top"><td className="whitespace-nowrap px-3 py-2">{when(entry.createdAt)}</td><td className="px-3 py-2">{entry.actor?.displayName ?? (entry.actorId ? "Inactive account" : "Unauthenticated")}</td><td className="px-3 py-2 font-mono">{entry.action}</td><td className="px-3 py-2">{entry.targetType ?? "—"}</td><td className="px-3 py-2">{entry.eventName ?? "—"}</td><td className="px-3 py-2"><span className={entry.outcome === "SUCCESS" ? "text-success-foreground" : "text-danger-foreground"}>{entry.outcome === "SUCCESS" ? "✓ Success" : "✕ Failure"}</span></td><td className="max-w-sm whitespace-pre-wrap break-words px-3 py-2">{entry.summary === null ? "—" : JSON.stringify(entry.summary)}</td></tr>)}</tbody></table></div>} />
    {result.logs.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><p className="text-base font-medium">No audit entries match these filters.</p><a className="mt-2 inline-flex min-h-11 items-center underline" href="/audit-logs">Clear filters</a></div>}
    <div className="flex items-center justify-between gap-3 text-sm"><span>{result.total} entries · page {result.page} of {result.pages}</span><div className="flex gap-2">{result.page > 1 && <a className="inline-flex min-h-11 items-center rounded border px-3" href={pageUrl(params, result.page - 1)}>Previous</a>}{result.page < result.pages && <a className="inline-flex min-h-11 items-center rounded border px-3" href={pageUrl(params, result.page + 1)}><span className="md:hidden">Load more</span><span className="hidden md:inline">Next</span></a>}</div></div>
  </div>;
}
