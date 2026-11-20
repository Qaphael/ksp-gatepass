import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { FileDown, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ticketListQuerySchema, type TicketListQuery } from "@/lib/validation/tickets";
import { listEvents } from "@/server/services/events.service";
import { listTicketTypes } from "@/server/services/ticket-types.service";
import { listTickets } from "@/server/services/tickets.service";
import { listSales } from "@/server/services/sales.service";
import { saleListQuerySchema } from "@/lib/validation/sales";
import { InventoryFilters } from "@/components/tickets/inventory-filters";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { Serial } from "@/components/ui/serial";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { ResponsiveList } from "@/components/ui/responsive-list";
import type { TicketStatus } from "@/generated/prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
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
      <div><h1 className="text-2xl font-semibold">My tickets</h1><p className="mt-1 text-sm text-muted-foreground">Tickets issued through your sales. Open a sale for its receipt and payment history.</p></div>
      {tickets.length ? <ResponsiveList cardsUntil="lg" cards={tickets.map((ticket) => <Link key={ticket.id} href={`/sales/${ticket.saleId}`} className="block min-w-0 rounded-xl border bg-card p-4 active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-start justify-between gap-3"><Serial className="text-base font-semibold">{ticket.serial}</Serial><TicketStatusBadge status={ticket.status as TicketStatus} /></div><p className="mt-2 truncate text-base">{ticket.category} · {ticket.eventName}</p><p className="mt-2 text-sm text-muted-foreground">Sale {ticket.saleReference}</p></Link>)} table={<div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-base"><thead className="bg-muted/50"><tr>{["Serial", "Category", "Event", "Status", "Sale"].map((label) => <th className="px-3 py-2 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{tickets.map((ticket) => <tr className="border-t" key={ticket.id}><td className="px-3 py-2"><Serial>{ticket.serial}</Serial></td><td className="px-3 py-2">{ticket.category}</td><td className="px-3 py-2">{ticket.eventName}</td><td className="px-3 py-2"><TicketStatusBadge status={ticket.status as TicketStatus} /></td><td className="px-3 py-2"><Link className="underline" href={`/sales/${ticket.saleId}`}>{ticket.saleReference}</Link></td></tr>)}</tbody></table></div>} /> : <div className="rounded-xl border border-dashed border-border p-8 text-center"><p className="text-base font-medium">No tickets yet</p><p className="mt-1 text-base text-muted-foreground">Tickets from your completed sales will appear here.</p><Link className="mt-4 inline-flex min-h-11 items-center underline underline-offset-4" href="/sales/new">Create a sale</Link></div>}
      <div className="flex items-center justify-between text-base text-muted-foreground"><span>{sales.total} sales · page {sales.page} of {pages}</span><span className="flex gap-3">{sales.page > 1 ? <Link className="min-h-11 inline-flex items-center underline" href={`/tickets?page=${sales.page - 1}`}>Previous</Link> : null}{sales.page < pages ? <Link className="min-h-11 inline-flex items-center underline" href={`/tickets?page=${sales.page + 1}`}><span className="md:hidden">Load more</span><span className="hidden md:inline">Next</span></Link> : null}</span></div>
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
  const activeFilters = [query.eventId, query.status, query.ticketTypeId, query.batchId, query.search].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Ticket inventory"
        description="Search serials, filter by event, category or inventory status, and open a ticket for its full history."
        actions={<div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {can(ctx.role, "inventory:export") && query.eventId ? (
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
          {can(ctx.role, "inventory:generate") ? (
            <Button nativeButton={false} size="sm" className="min-h-11 text-base" render={<Link href="/tickets/new" />}>
              <Plus /> Generate tickets
            </Button>
          ) : null}
        </div>}
      />

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

      {/* Reset link when filters active */}
      {activeFilters > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {activeFilters} filter{activeFilters > 1 ? "s" : ""} active
          </span>
          <Link href="/tickets" className="text-sm font-medium text-primary underline-offset-2 hover:underline flex items-center gap-1">
            <RefreshCw className="size-4 shrink-0" aria-hidden="true" /> Reset
          </Link>
        </div>
      )}

      <FilterSheet activeCount={activeFilters}><InventoryFilters
        events={events.map((event) => ({ id: event.id, name: event.name }))}
        ticketTypes={ticketTypes.map((type) => ({
          id: type.id,
          name: type.name,
        }))}
        initial={query}
      /></FilterSheet>

      <TicketsTable
        tickets={result.tickets}
        showEvent={!query.eventId}
        canRemove={can(ctx.role, "ticket:revoke")}
      />

      <div className="flex items-center justify-between text-base text-muted-foreground">
        <span>
          {result.total} {result.total === 1 ? "ticket" : "tickets"} · page{" "}
          {result.page} of {pages}
        </span>
        <span className="flex gap-2">
          {result.page > 1 ? (
            <Link
              href={pageHref(query, result.page - 1)}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 underline underline-offset-2 hover:text-foreground"
            >
              Previous
            </Link>
          ) : null}
          {result.page < pages ? (
            <Link
              href={pageHref(query, result.page + 1)}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 underline underline-offset-2 hover:text-foreground"
            >
              <span className="md:hidden">Load more</span><span className="hidden md:inline">Next</span>
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
