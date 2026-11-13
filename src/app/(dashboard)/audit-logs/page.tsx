import { redirect } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, CircleX, Search } from "lucide-react";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { auditLogQuerySchema } from "@/lib/validation/reports";
import { listEvents } from "@/server/services/events.service";
import { listAuditLogs } from "@/server/services/audit.service";
import { listUsers } from "@/server/services/users.service";
import { PageHeader } from "@/components/ui/page-header";

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
  const cards = result.logs.map((entry) => <article key={entry.id} className="rounded-[18px] border border-border/70 bg-card p-4 shadow-card">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="truncate font-semibold">{entry.action.replaceAll("_", " ")}</h2><time className="mt-1 block text-sm text-muted-foreground">{when(entry.createdAt)}</time></div>
      <Outcome outcome={entry.outcome} />
    </div>
    <dl className="mt-4 grid gap-3 border-t border-border/70 pt-3 text-sm sm:grid-cols-2">
      <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actor</dt><dd className="mt-1 truncate font-medium">{entry.actor?.displayName ?? (entry.actorId ? "Inactive account" : "Unauthenticated")}</dd><dd className="text-muted-foreground">{entry.actorRole ?? "No role"}</dd></div>
      <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target and event</dt><dd className="mt-1 break-words font-medium">{entry.targetType ?? "No target"}</dd>{entry.targetId ? <dd className="break-all font-mono text-xs text-muted-foreground">{entry.targetId}</dd> : null}<dd className="break-words text-muted-foreground">{entry.eventName ?? "No event"}</dd></div>
    </dl>
    <details className="group mt-3 overflow-hidden rounded-[12px] bg-muted/60 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 font-medium marker:hidden [&::-webkit-details-marker]:hidden">Change summary<ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <pre className="max-h-56 overflow-auto border-t border-border/60 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">{entry.summary === null ? "No summary" : JSON.stringify(entry.summary, null, 2)}</pre>
    </details>
  </article>);
  return <div className="flex flex-col gap-4">
    <PageHeader title="Audit log" description="Search critical actions with actor, event, outcome and safe change summaries." />
    {!parsed.success && <p className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm" role="status">Some filter values were invalid and have been reset. Update the filters and search again.</p>}
    <FilterSheet activeCount={activeCount}><form className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 md:rounded-[18px] md:border md:border-border/70 md:bg-card md:p-4 md:shadow-card lg:p-5">
      <label className="grid gap-1.5 text-sm font-semibold">Event<select name="eventId" defaultValue={query.eventId ?? ""} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm"><option value="">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-semibold">Actor<select name="actorId" defaultValue={query.actorId ?? ""} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm"><option value="">All actors</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.username}{user.active ? "" : " (inactive)"}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-semibold">Action<input name="action" defaultValue={query.action} placeholder="sale, auth, ticket…" className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm" /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Target or ID<input name="q" defaultValue={query.q} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm" /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Outcome<select name="outcome" defaultValue={query.outcome ?? ""} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm"><option value="">All outcomes</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option></select></label>
      <label className="grid gap-1.5 text-sm font-semibold">From<input type="date" name="from" defaultValue={query.from} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm" /></label>
      <label className="grid gap-1.5 text-sm font-semibold">To<input type="date" name="to" defaultValue={query.to} className="min-h-12 rounded-control border border-input bg-card px-3 text-base font-normal shadow-sm" /></label>
      <Button type="submit" className="min-h-12 w-full self-end md:w-auto lg:col-span-4 lg:justify-self-end"><Search aria-hidden="true" />Search</Button>
    </form></FilterSheet>
    <ResponsiveList cards={cards} table={<div className="overflow-hidden rounded-[18px] border border-border/70 bg-card shadow-card"><Table className="min-w-[900px] table-fixed text-sm">
      <caption className="sr-only">Audit entries matching the selected filters</caption>
      <TableHeader className="bg-muted/70"><TableRow className="border-b border-border hover:bg-transparent"><TableHead className="w-40">Time</TableHead><TableHead className="w-44">Actor</TableHead><TableHead className="w-48">Action</TableHead><TableHead>Target and event</TableHead><TableHead className="w-56">Outcome and summary</TableHead></TableRow></TableHeader>
      <TableBody>{result.logs.map((entry) => <TableRow key={entry.id} className="align-top hover:bg-accent/30">
        <TableCell className="whitespace-nowrap py-3 text-muted-foreground">{when(entry.createdAt)}</TableCell>
        <TableCell className="whitespace-normal py-3"><span className="block font-medium">{entry.actor?.displayName ?? (entry.actorId ? "Inactive account" : "Unauthenticated")}</span><span className="text-sm text-muted-foreground">{entry.actorRole ?? "No role"}</span></TableCell>
        <TableCell className="whitespace-normal py-3"><span className="block font-medium">{entry.action.replaceAll("_", " ")}</span><span className="font-mono text-xs text-muted-foreground">{entry.action}</span></TableCell>
        <TableCell className="whitespace-normal py-3"><span className="block font-medium">{entry.targetType ?? "No target"}</span>{entry.targetId ? <span className="block break-all font-mono text-xs text-muted-foreground">{entry.targetId}</span> : null}<span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.eventName ?? "No event"}</span></TableCell>
        <TableCell className="whitespace-normal py-3"><Outcome outcome={entry.outcome} /><details className="mt-2"><summary className="flex min-h-9 cursor-pointer items-center gap-1 text-sm font-medium text-primary">Change summary<ChevronDown className="size-4" aria-hidden="true" /></summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-muted/60 p-2 font-mono text-xs">{entry.summary === null ? "No summary" : JSON.stringify(entry.summary, null, 2)}</pre></details></TableCell>
      </TableRow>)}</TableBody>
    </Table></div>} />
    {result.logs.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><p className="text-base font-medium">No audit entries match these filters.</p><a className="mt-2 inline-flex min-h-11 items-center underline" href="/audit-logs">Clear filters</a></div>}
    <div className="flex items-center justify-between gap-3 text-sm"><span>{result.total} entries · page {result.page} of {result.pages}</span><nav aria-label="Audit log pages" className="flex gap-2">{result.page > 1 && <Link className="inline-flex min-h-11 items-center rounded-control border border-border bg-card px-3 font-medium hover:bg-muted" href={pageUrl(params, result.page - 1)}>Previous</Link>}{result.page < result.pages && <Link className="inline-flex min-h-11 items-center rounded-control border border-border bg-card px-3 font-medium hover:bg-muted" href={pageUrl(params, result.page + 1)}><span className="md:hidden">Load more</span><span className="hidden md:inline">Next</span></Link>}</nav></div>
  </div>;
}

function Outcome({ outcome }: { outcome: "SUCCESS" | "FAILURE" }) {
  const success = outcome === "SUCCESS";
  const Icon = success ? Check : CircleX;
  return <span className={success ? "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-success/50 bg-success px-2.5 text-sm font-semibold text-success-foreground" : "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-danger/40 bg-danger px-2.5 text-sm font-semibold text-danger-foreground"}>
    <Icon className="size-4" aria-hidden="true" />{success ? "Success" : "Failure"}
  </span>;
}
