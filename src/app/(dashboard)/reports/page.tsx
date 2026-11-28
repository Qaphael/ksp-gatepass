import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AlertTriangleIcon, DownloadIcon, FileBarChartIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { ReportsTable, type ReportCell } from "@/components/reports/reports-table";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { UrlFiltersBar } from "@/components/ui/url-filters-bar";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { reportQuerySchema } from "@/lib/validation/reports";
import { listEvents } from "@/server/services/events.service";
import { availableReports, getReport } from "@/server/services/reports.service";

export const instant = false;
type Search = Record<string, string | string[] | undefined>;

function one(params: Search, key: string) {
  return typeof params[key] === "string" ? (params[key] as string) : undefined;
}

function exportUrl(
  query: { eventId: string; type: string; from?: string; to?: string },
  format: "csv" | "pdf",
) {
  const search = new URLSearchParams({ eventId: query.eventId, type: query.type, format });
  if (query.from) search.set("from", query.from);
  if (query.to) search.set("to", query.to);
  return `/api/v1/reports/export?${search.toString()}`;
}

function reportNumber(rows: ReportCell[][], label: string): number | null {
  const value = rows.find((row) => row[0] === label)?.[1];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function columnSum(rows: ReportCell[][], columns: string[], label: string): number | null {
  const index = columns.indexOf(label);
  if (index < 0) return null;
  let total = 0;
  let seen = false;
  for (const row of rows) {
    const value = row[index];
    if (typeof value === "number" && Number.isSafeInteger(value)) {
      total += value;
      seen = true;
    }
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
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const catalog = availableReports(ctx);
  if (!catalog.length) redirect("/dashboard");

  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === one(params, "eventId")) ?? events[0];
  const selectedType = one(params, "type") ?? catalog[0]?.type;
  const parsed =
    event && selectedType
      ? reportQuerySchema.safeParse({
          eventId: event.id,
          type: selectedType,
          ...(one(params, "from") ? { from: one(params, "from") } : {}),
          ...(one(params, "to") ? { to: one(params, "to") } : {}),
        })
      : null;
  const query = parsed?.success ? parsed.data : null;
  const data = query ? await getReport(ctx, query) : null;
  const canExport = can(ctx.role, "report:export-full") || can(ctx.role, "report:export-own");

  const summaryTiles =
    data && (data.type === "RECONCILIATION" || data.type === "PAYMENTS_BY_METHOD")
      ? [
          {
            label: data.type === "RECONCILIATION" ? "Gross sales" : "Gross recorded",
            value:
              data.type === "RECONCILIATION"
                ? reportNumber(data.rows, "Gross sales value (UGX)")
                : columnSum(data.rows, data.columns, "Payments recorded UGX"),
          },
          {
            label: "Net recorded payments",
            value:
              data.type === "RECONCILIATION"
                ? reportNumber(data.rows, "Net recorded payments (UGX)")
                : columnSum(data.rows, data.columns, "Net recorded UGX"),
          },
          {
            label: "Outstanding",
            value:
              data.type === "RECONCILIATION"
                ? reportNumber(data.rows, "Outstanding balances (UGX)")
                : null,
          },
        ].filter((tile): tile is { label: string; value: number } => tile.value !== null)
      : [];

  const channelColumn =
    data?.type === "PAYMENTS_BY_METHOD" ? data.columns.indexOf("Net recorded UGX") : -1;
  const channels =
    data?.type === "PAYMENTS_BY_METHOD" && channelColumn >= 0
      ? data.rows.map((row) => ({
          key: String(row[0] ?? "—"),
          label:
            METHOD_LABELS[String(row[0] ?? "")] ??
            String(row[0] ?? "—").replaceAll("_", " ").toLowerCase(),
          amount:
            typeof row[channelColumn] === "number" && Number.isSafeInteger(row[channelColumn])
              ? (row[channelColumn] as number)
              : null,
        }))
      : [];

  const channelTotal = channels.reduce((sum, channel) => sum + (channel.amount ?? 0), 0);
  const gross =
    summaryTiles.find((tile) => tile.label === "Gross sales" || tile.label === "Gross recorded")
      ?.value ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Event sales, payments, attendance and reconciliation from server records."
        actions={
          canExport && query && data ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={<a href={exportUrl(query, "csv")} />}
              >
                <DownloadIcon aria-hidden="true" />
                Export CSV
              </Button>
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={<a href={exportUrl(query, "pdf")} />}
              >
                <DownloadIcon aria-hidden="true" />
                Export PDF
              </Button>
            </div>
          ) : undefined
        }
      />

      <UrlFiltersBar
        basePath="/reports"
        applyLabel="Run report"
        fields={[
          {
            id: "eventId",
            label: "Event",
            type: "select",
            options: events.map((item) => ({ value: item.id, label: item.name })),
          },
          {
            id: "type",
            label: "Report",
            type: "select",
            options: catalog.map((item) => ({ value: item.type, label: item.title })),
          },
          { id: "from", label: "From (YYYY-MM-DD)", type: "text", placeholder: "2026-01-01" },
          { id: "to", label: "To (YYYY-MM-DD)", type: "text", placeholder: "2026-12-31" },
        ]}
        initialValues={{
          eventId: event?.id,
          type: selectedType,
          from: one(params, "from"),
          to: one(params, "to"),
        }}
      />

      {data ? (
        <>
          {data.type === "PAYMENTS_BY_METHOD" || data.type === "RECONCILIATION" ? (
            <Alert variant="warning">
              <AlertTriangleIcon aria-hidden="true" />
              <AlertTitle>Staff-recorded figures</AlertTitle>
              <AlertDescription>
                Payments shown were recorded by staff. No bank or mobile-money provider
                verification is connected, and physical cash count is not tracked here.
              </AlertDescription>
            </Alert>
          ) : null}

          {summaryTiles.length > 0 ? (
            <Frame spacing="default">
              <FrameHeader>
                <FrameTitle>Summary</FrameTitle>
                <FrameDescription>Totals across {data.eventName}.</FrameDescription>
              </FrameHeader>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {summaryTiles.map((tile) => {
                  const pct =
                    gross && gross > 0 ? Math.round((tile.value / gross) * 100) : undefined;
                  return (
                    <FramePanel key={tile.label} className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs font-medium">
                        {tile.label}
                      </span>
                      <span className="text-2xl font-semibold tracking-tight tabular-nums">
                        <Money amount={tile.value} />
                      </span>
                      {pct !== undefined ? (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {pct}% of gross recorded
                        </span>
                      ) : null}
                    </FramePanel>
                  );
                })}
              </div>
            </Frame>
          ) : null}

          {channels.length > 0 ? (
            <Frame spacing="default">
              <FrameHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <FrameTitle>Payment channels</FrameTitle>
                    <FrameDescription>
                      Net of reversals and refunds across recorded channels.
                    </FrameDescription>
                  </div>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    Total: <Money amount={channelTotal} />
                  </span>
                </div>
              </FrameHeader>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {channels.map((channel) => {
                  const share =
                    channel.amount !== null && channelTotal > 0
                      ? `${Math.round((channel.amount / channelTotal) * 100)}% of recorded`
                      : "No recorded share";
                  return (
                    <FramePanel key={channel.key} className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs font-medium">
                        {channel.label}
                      </span>
                      <span className="text-xl font-semibold tracking-tight tabular-nums">
                        {channel.amount === null ? "—" : <Money amount={channel.amount} />}
                      </span>
                      <span className="text-muted-foreground text-xs">{share}</span>
                    </FramePanel>
                  );
                })}
              </div>
            </Frame>
          ) : null}

          <ReportsTable
            title={data.title}
            eventName={data.eventName}
            columns={data.columns}
            rows={data.rows}
          />
        </>
      ) : (
        <Frame spacing="default">
          <FramePanel>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileBarChartIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Choose a valid report</EmptyTitle>
                <EmptyDescription>
                  Select an event, report type and date range above to load data.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </FramePanel>
        </Frame>
      )}
    </div>
  );
}
