import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { FileDown, Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UrlFiltersBar } from "@/components/ui/url-filters-bar";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ticketListQuerySchema, type TicketListQuery } from "@/lib/validation/tickets";
import { listEvents } from "@/server/services/events.service";
import { listTicketTypes } from "@/server/services/ticket-types.service";
import { listTickets } from "@/server/services/tickets.service";
import { listSales } from "@/server/services/sales.service";
import { saleListQuerySchema } from "@/lib/validation/sales";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { SellerTicketsTable } from "@/components/tickets/seller-tickets-table";
import { PageHeader } from "@/components/ui/page-header";
import { Frame, FrameFooter, FramePanel } from "@/components/reui/frame";
import { StatTile } from "@/components/ui/stat-tile";
import { EatClock } from "@/components/tickets/eat-clock";
import { getReport } from "@/server/services/reports.service";

export const instant = false;

interface TicketsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Only real, single-valued string params reach the schema. */
function flattenParams(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value !== "") flat[key] = value;
  }
  return flat;
}

function pageHref(query: TicketListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.eventId) params.set("eventId", query.eventId);
  if (query.status) params.set("status", query.status);
  if (query.ticketTypeId) params.set("ticketTypeId", query.ticketTypeId);
  if (query.batchId) params.set("batchId", query.batchId);
  if (query.search) params.set("search", query.search);
  params.set("page", String(page));
  return `/tickets?${params.toString()}`;
}

function exportHref(query: TicketListQuery): string {
  const params = new URLSearchParams();
  params.set("eventId", query.eventId ?? "");
  if (query.status) params.set("status", query.status);
  if (query.ticketTypeId) params.set("ticketTypeId", query.ticketTypeId);
  if (query.batchId) params.set("batchId", query.batchId);
  if (query.search) params.set("search", query.search);
  return `/api/v1/tickets/export?${params.toString()}`;
}

/** Aggregate TICKET_INVENTORY report rows into KPI totals. */
function inventoryKpis(rows: unknown[]): { total: number; sold: number; available: number; revoked: number } {
  let total = 0;
  let sold = 0;
  let available = 0;
  let revoked = 0;
  for (const row of rows) {
    const cells = row as unknown[];
    const status = cells[1];
    const count = Number(cells[2]) || 0;
    total += count;
    if (status === "SOLD") sold += count;
    else if (status === "AVAILABLE") available += count;
    else if (status === "REVOKED") revoked += count;
  }
  return { total, sold, available, revoked };
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  await connection();
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "inventory:read") && can(ctx.role, "sale:read-own")) {
    const params = await searchParams;
    const page = typeof params.page === "string" ? params.page : "1";
    const sales = await listSales(ctx, saleListQuerySchema.parse({ page, pageSize: 25 }));
    const tickets = sales.sales.flatMap((sale) => sale.items.flatMap((item) => item.tickets.map((ticket) => ({
      ...ticket,
      saleId: sale.id,
      saleReference: sale.reference,
      eventName: sale.eventName,
      category: item.ticketTypeName,
    }))));
    const pages = Math.max(1, Math.ceil(sales.total / sales.pageSize));
    return <div className="flex flex-col gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">My tickets</h1><p className="mt-1 text-sm text-muted-foreground">Tickets issued through your sales. Open a sale for its receipt and payment history.</p></div>
      <SellerTicketsTable tickets={tickets} totalSales={sales.total} page={sales.page} pages={pages} />
    </div>;
  }
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");

  const params = await searchParams;
  const parsed = ticketListQuerySchema.safeParse(flattenParams(params));
  const query = parsed.success ? parsed.data : ticketListQuerySchema.parse({});

  const [events, result] = await Promise.all([
    listEvents(ctx),
    listTickets(ctx, { ...query, include: "trace" }),
  ]);
  const ticketTypes = query.eventId
    ? await listTicketTypes(ctx, query.eventId)
    : [];

  // KPI strip from the TICKET_INVENTORY report. The report is per-event, so when
  // the list is showing all events we sum one report per event.
  const kpiEventIds = query.eventId ? [query.eventId] : events.map((event) => event.id);
  let kpis: { total: number; sold: number; available: number; revoked: number } | null = null;
  if (kpiEventIds.length) {
    const reports = await Promise.all(
      kpiEventIds.map((eventId) =>
        getReport(ctx, { eventId, type: "TICKET_INVENTORY" }).catch(() => null),
      ),
    );
    const rows = reports.flatMap((report) => report?.rows ?? []);
    if (rows.length) kpis = inventoryKpis(rows);
  }

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageFrom = (result.page - 1) * result.pageSize + 1;
  const pageTo = Math.min(result.page * result.pageSize, result.total);
  const canExport = can(ctx.role, "inventory:export") && Boolean(query.eventId);
  const canGenerate = can(ctx.role, "inventory:generate");
  const tabClass = (active: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-md px-3 py-2 text-base font-semibold ${active ? "bg-background text-foreground" : "text-muted-foreground"}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Ticket inventory"
        badge={kpis ? <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-muted-foreground">{kpis.total} Cap</span> : null}
        description="Search serials, filter by event, category or inventory status, and open a ticket for its full history."
        actions={
          <div className={canExport && canGenerate ? "grid w-full grid-cols-2 gap-2 sm:w-auto" : "flex w-full flex-wrap gap-2 sm:w-auto"}>
            {canExport ? (
              <Button
                size="sm"
                className="min-h-11 text-base"
                variant="outline"
                nativeButton={false}
                render={<a href={exportHref(query)} />}
              >
                <FileDown /> Export CSV
              </Button>
            ) : null}
            {canGenerate ? (
              <Button nativeButton={false} size="sm" className="min-h-11 text-base" render={<Link href="/tickets/new" />}>
                <Plus /> Generate tickets
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Segmented view controller: All tickets vs My issued stock. */}
      <div className="flex min-h-11 rounded-lg bg-muted p-1" role="tablist" aria-label="Ticket scope">
        <Link href="/tickets" aria-current="true" className={tabClass(true)}>All tickets</Link>
        <Link href="/stock" className={tabClass(false)}>My issued stock</Link>
      </div>

      {/* KPI strip */}
      {kpis && (() => {
        const share = (value: number) => (kpis!.total ? Math.round((value / kpis!.total) * 100) : 0);
        return (
          <section aria-label="Inventory totals" className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Total" value={String(kpis.total)} sub="Tickets in inventory" />
            <StatTile
              label="Sold"
              value={String(kpis.sold)}
              sub={`${share(kpis.sold)}% of total`}
              percent={share(kpis.sold)}
            />
            <StatTile
              label="Available"
              value={String(kpis.available)}
              sub={`${share(kpis.available)}% of total`}
              percent={share(kpis.available)}
            />
            <StatTile
              label="Revoked"
              value={String(kpis.revoked)}
              sub={`${share(kpis.revoked)}% of total`}
            />
          </section>
        );
      })()}

      <UrlFiltersBar
        basePath="/tickets"
        resetPage
        fields={[
          { id: "search", label: "Serial", type: "text", placeholder: "KSP-00001" },
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
              { value: "AVAILABLE", label: "Available" },
              { value: "RESERVED", label: "Reserved" },
              { value: "SOLD", label: "Sold" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "REVOKED", label: "Revoked" },
            ],
          },
          ...(ticketTypes.length > 0
            ? [
                {
                  id: "ticketTypeId",
                  label: "Category",
                  type: "select" as const,
                  options: ticketTypes.map((type) => ({ value: type.id, label: type.name })),
                },
              ]
            : []),
        ]}
        initialValues={{
          search: query.search,
          eventId: query.eventId,
          status: query.status,
          ticketTypeId: query.ticketTypeId,
        }}
      />

      {/* Live stream status strip */}
      <div className="flex items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
          <span className="min-w-0 truncate font-medium text-foreground">Verified Stream</span>
          <span className="shrink-0">Sync: Live</span>
        </span>
        <span className="shrink-0 font-mono text-xs">Sort: Serial (ASC)</span>
      </div>

      <TicketsTable
        tickets={result.tickets}
        showEvent={!query.eventId}
        canRemove={can(ctx.role, "ticket:revoke")}
      />

      <Frame spacing="default">
        <FrameFooter>
          <div className="flex w-full flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              Showing <strong className="text-foreground font-semibold">{pageFrom}–{pageTo}</strong> of{" "}
              <strong className="text-foreground font-semibold">{result.total}</strong> entries · page{" "}
              {result.page} of {pages}
            </span>
            <div className="flex items-center gap-2">
              {result.page > 1 ? (
                <Button
                  nativeButton={false}
                  variant="outline"
                  size="sm"
                  render={<Link href={pageHref(query, result.page - 1)} />}
                >
                  Previous
                </Button>
              ) : null}
              {result.page < pages ? (
                <Button
                  nativeButton={false}
                  variant="outline"
                  size="sm"
                  render={<Link href={pageHref(query, result.page + 1)} />}
                >
                  Next
                </Button>
              ) : null}
            </div>
          </div>
        </FrameFooter>
      </Frame>

      <Frame spacing="default">
        <FramePanel className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            <Server className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">KSP Hotel Server · Gulu Station</span>
          </span>
          <EatClock />
        </FramePanel>
      </Frame>
    </div>
  );
}
