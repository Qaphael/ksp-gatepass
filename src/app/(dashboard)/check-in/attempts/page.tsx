import { redirect } from "next/navigation";
import { AlertTriangleIcon } from "lucide-react";
import { ScanAttemptsTable, type ScanAttemptRow } from "@/components/check-in/scan-attempts-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { Frame, FramePanel } from "@/components/reui/frame";
import { PageHeader } from "@/components/ui/page-header";
import { UrlFiltersBar } from "@/components/ui/url-filters-bar";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { scanAttemptQuerySchema } from "@/lib/validation/check-in";
import { listScanAttempts } from "@/server/services/check-in.service";
import { listEvents } from "@/server/services/events.service";

export const instant = false;

const RESULT_CODES = [
  "INVALID_QR",
  "UNKNOWN_SERIAL",
  "NOT_PAID",
  "TICKET_REVOKED",
  "ALREADY_USED",
  "ADMITTED",
  "ELIGIBLE",
] as const;

export default async function ScanAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; method?: string; resultCode?: string; before?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "checkin:read-attempts")) redirect("/dashboard");

  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === params.eventId) ?? events[0];
  const parsed = event
    ? scanAttemptQuerySchema.safeParse({
        eventId: event.id,
        method: params.method,
        resultCode: params.resultCode,
        before: params.before,
        limit: 100,
      })
    : null;
  const rows = parsed?.success ? await listScanAttempts(ctx, parsed.data) : [];
  const invalidFilters =
    Boolean(params.method && !["QR", "SERIAL"].includes(params.method)) ||
    Boolean(
      params.resultCode &&
        !RESULT_CODES.includes(params.resultCode as (typeof RESULT_CODES)[number]),
    );
  const next = rows.length === 100 ? rows[rows.length - 1]?.attemptedAt : undefined;
  const nextCursorUrl =
    next && event
      ? `/check-in/attempts?${new URLSearchParams({
          eventId: event.id,
          ...(params.method ? { method: params.method } : {}),
          ...(params.resultCode ? { resultCode: params.resultCode } : {}),
          before: next,
        })}`
      : null;

  const denied = rows.filter(
    (r) => r.resultCode !== "ADMITTED" && r.resultCode !== "ELIGIBLE",
  ).length;
  const admitted = rows.length - denied;

  const tableRows: ScanAttemptRow[] = rows.map((row) => ({
    id: row.id,
    attemptedAt: row.attemptedAt,
    method: row.method,
    serial: row.serial,
    gate: row.gate,
    resultCode: row.resultCode,
    actorName: row.actor.displayName,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Scan attempts"
        badge={<Badge variant="success-light">Active Guard</Badge>}
        description="Gate telemetry, denied scans and passback alerts."
      />

      {rows.length > 0 ? (
        <Frame spacing="default">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FramePanel className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium">Total attempts</span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                {rows.length}
              </span>
            </FramePanel>
            <FramePanel className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium">Denied</span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">{denied}</span>
            </FramePanel>
            <FramePanel className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium">Admitted</span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">{admitted}</span>
            </FramePanel>
          </div>
        </Frame>
      ) : null}

      {event ? (
        <UrlFiltersBar
          basePath="/check-in/attempts"
          fields={[
            {
              id: "eventId",
              label: "Event",
              type: "select",
              options: events.map((item) => ({ value: item.id, label: item.name })),
            },
            {
              id: "method",
              label: "Method",
              type: "select",
              options: [
                { value: "QR", label: "QR" },
                { value: "SERIAL", label: "Serial" },
              ],
            },
            {
              id: "resultCode",
              label: "Result",
              type: "select",
              options: RESULT_CODES.map((code) => ({
                value: code,
                label: code.replaceAll("_", " "),
              })),
            },
          ]}
          initialValues={{
            eventId: event.id,
            method: params.method,
            resultCode: params.resultCode,
          }}
        />
      ) : null}

      {invalidFilters ? (
        <Alert variant="warning" role="status">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>Invalid filters</AlertTitle>
          <AlertDescription>
            Some filter values were invalid. Choose a valid method or result and apply again.
          </AlertDescription>
        </Alert>
      ) : null}

      <ScanAttemptsTable rows={tableRows} nextCursorUrl={nextCursorUrl} />
    </div>
  );
}
