import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { saleListQuerySchema } from "@/lib/validation/sales";
import { listEvents } from "@/server/services/events.service";
import { listSales, getSalesTotals } from "@/server/services/sales.service";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { Money, formatUGX } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { Frame, FrameFooter } from "@/components/reui/frame";
import { StatTile } from "@/components/ui/stat-tile";
import { UrlFiltersBar } from "@/components/ui/url-filters-bar";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { SalesTable } from "@/components/sales/sales-table";

export const instant = false;

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "sale:read-own") && !can(ctx.role, "sale:read-all")) redirect("/dashboard");
  const params = await searchParams;
  const query = saleListQuerySchema.parse({
    ...(typeof params.eventId === "string" ? { eventId: params.eventId } : {}),
    ...(typeof params.status === "string" ? { status: params.status } : {}),
    ...(typeof params.search === "string" ? { search: params.search } : {}),
    ...(typeof params.page === "string" ? { page: params.page } : {}),
  });
  const [events, result, totals] = await Promise.all([
    listEvents(ctx),
    listSales(ctx, query),
    getSalesTotals(ctx, query),
  ]);

  const statusOptions: Array<{ label: string; status: "PENDING_PAYMENT" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | "REFUNDED" | undefined }> = [
    { label: "All", status: undefined },
    { label: "Paid", status: "PAID" },
    { label: "Partially paid", status: "PARTIALLY_PAID" },
    { label: "Pending", status: "PENDING_PAYMENT" },
    { label: "Cancelled", status: "CANCELLED" },
  ];

  function statusHref(status: "PENDING_PAYMENT" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | "REFUNDED" | undefined): string {
    const search = new URLSearchParams();
    if (query.eventId) search.set("eventId", query.eventId);
    if (query.search) search.set("search", query.search);
    if (status) search.set("status", status);
    search.set("page", "1");
    return `/sales?${search.toString()}`;
  }

  function pageHref(page: number): string {
    const search = new URLSearchParams();
    if (query.eventId) search.set("eventId", query.eventId);
    if (query.status) search.set("status", query.status);
    if (query.search) search.set("search", query.search);
    search.set("page", String(page));
    return `/sales?${search.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Sales Transactions"
        description="Browse, filter & reconcile ticket sales in real-time."
        actions={can(ctx.role, "sale:create") ? (
          <Button nativeButton={false} size="sm" className="min-h-11 text-base" render={<Link href="/sales/new" />}>
            <Plus className="size-4 shrink-0" aria-hidden="true" /> New Sale
          </Button>
        ) : undefined}
      />

      {/* KPI Strip: 2x2 bento grid */}
      <section aria-label="Sales totals" className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sales" value={String(totals.saleCount)} />
        <StatTile label="Gross" value={formatUGX(totals.grossUgx)} sub="Total before payments" />
        <StatTile label="Collected" value={formatUGX(totals.collectedNetUgx)} sub="Payments net of adjustments" />
        <StatTile label="Outstanding" value={formatUGX(totals.outstandingUgx)} sub="Unpaid balances" />
      </section>

      {/* Status quick links */}
      <section aria-label="Filter by status" className="flex flex-wrap gap-2">
        {statusOptions.map((option) => {
          const active = query.status === option.status;
          return (
            <Link
              key={option.label}
              href={statusHref(option.status)}
              className={cn(
                "inline-flex items-center gap-1.5 min-h-10 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-foreground border-transparent"
                  : "bg-card border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {option.status ? <StatusBadge domain="sale" status={option.status} className="text-xs" /> : option.label}
            </Link>
          );
        })}
      </section>

      {/* ReUI Filters bar */}
      <UrlFiltersBar
        basePath="/sales"
        resetPage
        fields={[
          { id: "search", label: "Search", type: "text", placeholder: "Reference, name, or phone" },
          {
            id: "eventId",
            label: "Event",
            type: "select",
            options: events.map((event) => ({ value: event.id, label: event.name })),
          },
          {
            id: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "PAID", label: "Paid" },
              { value: "PARTIALLY_PAID", label: "Partially paid" },
              { value: "PENDING_PAYMENT", label: "Pending" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "REFUNDED", label: "Refunded" },
            ],
          },
        ]}
        initialValues={{
          search: query.search,
          eventId: query.eventId,
          status: query.status,
        }}
      />

      <ResponsiveList
        cards={result.sales.map((sale) => {
          const ticketTypes = sale.items.map((i) => i.ticketTypeName).join(", ");
          const ticketCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <Link
              key={sale.id}
              href={`/sales/${sale.id}`}
              className="block min-w-0 rounded-xl border border-border bg-card p-4 active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-base font-semibold">{sale.reference}</span>
                    <span className="text-xs text-muted-foreground">{ticketTypes}</span>
                  </div>
                  {sale.customerName ? <p className="mt-1 truncate text-sm font-medium">{sale.customerName}</p> : null}
                  {sale.customerPhone ? <p className="text-xs text-muted-foreground">{sale.customerPhone}</p> : null}
                </div>
                <StatusBadge domain="sale" status={sale.status} className="text-xs" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-muted-foreground">Amount received</span>
                  <span className="font-mono text-base font-semibold tabular-nums"><Money amount={sale.totalUgx} /></span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(sale.createdAt, "Africa/Kampala", "en-UG", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })} EAT
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{sale.seller.displayName} · {ticketCount} ticket{ticketCount !== 1 ? "s" : ""}</span>
                <span className="text-xs font-medium text-primary">View sale</span>
              </div>
            </Link>
          );
        })}
        table={
          <SalesTable sales={result.sales} />
        }
      />

      {result.sales.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-base font-medium">No sales match these filters.</p>
          <Link className="mt-2 inline-flex min-h-11 items-center underline" href="/sales">
            Clear filters
          </Link>
        </div>
      )}

      <Frame spacing="default">
        <FrameFooter>
          <div className="flex w-full flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {result.total} {result.total === 1 ? "sale" : "sales"} · page {result.page} of{" "}
              {Math.max(1, Math.ceil(result.total / result.pageSize))}
            </span>
            <div className="flex items-center gap-2">
              {result.page > 1 ? (
                <Button nativeButton={false} variant="outline" size="sm" render={<Link href={pageHref(result.page - 1)} />}>
                  Previous
                </Button>
              ) : null}
              {result.page < Math.ceil(result.total / result.pageSize) ? (
                <Button nativeButton={false} variant="outline" size="sm" render={<Link href={pageHref(result.page + 1)} />}>
                  Next
                </Button>
              ) : null}
            </div>
          </div>
        </FrameFooter>
      </Frame>
    </div>
  );
}
