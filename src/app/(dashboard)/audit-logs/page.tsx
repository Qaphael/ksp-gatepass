import { redirect } from "next/navigation";
import { AlertTriangleIcon } from "lucide-react";
import { AuditLogsTable, type AuditLogRow } from "@/components/audit/audit-logs-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { UrlFiltersBar } from "@/components/ui/url-filters-bar";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { auditLogQuerySchema } from "@/lib/validation/reports";
import { listAuditLogs } from "@/server/services/audit.service";
import { listEvents } from "@/server/services/events.service";
import { listUsers } from "@/server/services/users.service";

export const instant = false;
type Search = Record<string, string | string[] | undefined>;
const one = (params: Search, key: string) =>
  typeof params[key] === "string" ? (params[key] as string) : undefined;

function pageUrl(params: Search, page: number) {
  const search = new URLSearchParams();
  for (const key of ["eventId", "actorId", "action", "outcome", "q", "from", "to"]) {
    const value = one(params, key);
    if (value) search.set(key, value);
  }
  search.set("page", String(page));
  return `/audit-logs?${search.toString()}`;
}

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "audit:read")) redirect("/dashboard");

  const [events, users, params] = await Promise.all([
    listEvents(ctx),
    listUsers(ctx),
    searchParams,
  ]);
  const parsed = auditLogQuerySchema.safeParse(
    Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string")),
  );
  const query = parsed.success ? parsed.data : auditLogQuerySchema.parse({});
  const result = await listAuditLogs(ctx, query);

  const rows: AuditLogRow[] = result.logs.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    actorName: entry.actor?.displayName ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    eventName: entry.eventName,
    outcome: entry.outcome,
    summary: entry.summary,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Search critical actions with actor, event, outcome and change summaries."
      />

      {!parsed.success ? (
        <Alert variant="warning" role="status">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>Invalid filter values</AlertTitle>
          <AlertDescription>
            Some filter values were invalid and have been reset. Update the filters and search
            again.
          </AlertDescription>
        </Alert>
      ) : null}

      <UrlFiltersBar
        basePath="/audit-logs"
        resetPage
        applyLabel="Search"
        fields={[
          {
            id: "eventId",
            label: "Event",
            type: "select",
            options: events.map((event) => ({ value: event.id, label: event.name })),
          },
          {
            id: "actorId",
            label: "Actor",
            type: "select",
            options: users.map((user) => ({
              value: user.id,
              label: `${user.displayName} · ${user.username}${user.active ? "" : " (inactive)"}`,
            })),
          },
          { id: "action", label: "Action", type: "text", placeholder: "sale, auth, ticket…" },
          { id: "q", label: "Target or ID", type: "text", placeholder: "Target ID or reference" },
          {
            id: "outcome",
            label: "Outcome",
            type: "select",
            options: [
              { value: "SUCCESS", label: "Success" },
              { value: "FAILURE", label: "Failure" },
            ],
          },
          { id: "from", label: "From (YYYY-MM-DD)", type: "text", placeholder: "2026-01-01" },
          { id: "to", label: "To (YYYY-MM-DD)", type: "text", placeholder: "2026-12-31" },
        ]}
        initialValues={{
          eventId: query.eventId,
          actorId: query.actorId,
          action: query.action,
          q: query.q,
          outcome: query.outcome,
          from: query.from,
          to: query.to,
        }}
      />

      <AuditLogsTable
        logs={rows}
        total={result.total}
        page={result.page}
        pages={result.pages}
        prevUrl={result.page > 1 ? pageUrl(params, result.page - 1) : null}
        nextUrl={result.page < result.pages ? pageUrl(params, result.page + 1) : null}
      />
    </div>
  );
}
