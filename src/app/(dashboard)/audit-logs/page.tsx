import { redirect } from "next/navigation";
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
  return <div className="flex flex-col gap-4">
    <div><h1 className="text-2xl font-semibold tracking-tight">Audit log</h1><p className="mt-1 text-sm text-muted-foreground">Search critical actions with actor, event, outcome and safe change summaries.</p></div>
    <form className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
      <label className="grid min-w-44 flex-1 gap-1 text-sm">Event<select name="eventId" defaultValue={query.eventId ?? ""} className="rounded-md border border-input bg-background px-3 py-2"><option value="">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
      <label className="grid min-w-40 flex-1 gap-1 text-sm">Actor<select name="actorId" defaultValue={query.actorId ?? ""} className="rounded-md border border-input bg-background px-3 py-2"><option value="">All actors</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.username}{user.active ? "" : " (inactive)"}</option>)}</select></label>
      <label className="grid min-w-40 flex-1 gap-1 text-sm">Action<input name="action" defaultValue={query.action} placeholder="sale, auth, ticket…" className="rounded-md border border-input bg-background px-3 py-2" /></label>
      <label className="grid min-w-40 flex-1 gap-1 text-sm">Target or ID<input name="q" defaultValue={query.q} className="rounded-md border border-input bg-background px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">Outcome<select name="outcome" defaultValue={query.outcome ?? ""} className="rounded-md border border-input bg-background px-3 py-2"><option value="">All</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option></select></label>
      <label className="grid gap-1 text-sm">From<input type="date" name="from" defaultValue={query.from} className="rounded-md border border-input bg-background px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">To<input type="date" name="to" defaultValue={query.to} className="rounded-md border border-input bg-background px-3 py-2" /></label>
      <button className="rounded-md border px-3 py-2 text-sm">Search</button>
    </form>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{["Time", "Actor", "Action", "Target", "Event", "Outcome", "Summary"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{result.logs.map((entry) => <tr key={entry.id} className="border-t border-border align-top"><td className="whitespace-nowrap px-3 py-2">{when(entry.createdAt)}</td><td className="px-3 py-2">{entry.actor?.displayName ?? (entry.actorId ? "Inactive account" : "Unauthenticated")}{entry.actorRole ? <div className="text-xs text-muted-foreground">{entry.actorRole}</div> : null}</td><td className="px-3 py-2 font-mono text-xs">{entry.action}</td><td className="px-3 py-2">{entry.targetType ?? "—"}{entry.targetId ? <div className="font-mono text-xs text-muted-foreground">{entry.targetId}</div> : null}</td><td className="px-3 py-2">{entry.eventName ?? "—"}</td><td className="px-3 py-2">{entry.outcome}</td><td className="max-w-sm whitespace-pre-wrap break-words px-3 py-2 text-xs">{entry.summary === null ? "—" : JSON.stringify(entry.summary)}</td></tr>)}{result.logs.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No audit entries match these filters.</td></tr>}</tbody></table></div>
    <div className="flex items-center justify-between text-sm"><span>{result.total} entries · page {result.page} of {result.pages}</span><div className="flex gap-2">{result.page > 1 && <a className="rounded border px-3 py-1" href={pageUrl(params, result.page - 1)}>Previous</a>}{result.page < result.pages && <a className="rounded border px-3 py-1" href={pageUrl(params, result.page + 1)}>Next</a>}</div></div>
  </div>;
}
