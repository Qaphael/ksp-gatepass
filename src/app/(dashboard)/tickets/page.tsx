import Link from "next/link";
import { redirect } from "next/navigation";
import { FileDown, Plus } from "lucide-react";
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

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
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
      {tickets.length ? <ul className="divide-y divide-border rounded-xl border border-border bg-card">{tickets.map((ticket) => <li key={ticket.id} className="flex min-w-0 items-center justify-between gap-3 p-4">
        <div className="min-w-0"><p className="truncate font-mono text-base font-semibold tracking-wide">{ticket.serial}</p><p className="truncate text-sm text-muted-foreground">{ticket.category} · {ticket.eventName}</p></div>
        <Link href={`/sales/${ticket.saleId}`} className="flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium underline underline-offset-4">{ticket.saleReference}</Link>
      </li>)}</ul> : <div className="rounded-xl border border-dashed border-border p-8 text-center"><p className="font-medium">No tickets yet</p><p className="mt-1 text-sm text-muted-foreground">Tickets from your completed sales will appear here.</p><Link className="mt-4 inline-flex min-h-11 items-center underline underline-offset-4" href="/sales/new">Create a sale</Link></div>}
      <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{sales.total} sales · page {sales.page} of {pages}</span><span className="flex gap-3">{sales.page > 1 ? <Link className="min-h-11 inline-flex items-center underline" href={`/tickets?page=${sales.page - 1}`}>Previous</Link> : null}{sales.page < pages ? <Link className="min-h-11 inline-flex items-center underline" href={`/tickets?page=${sales.page + 1}`}>Next</Link> : null}</span></div>
    </div>;
  }
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");

  const parsed = ticketListQuerySchema.safeParse(flattenParams(await searchParams));
  // Invalid/garbled filters simply fall back to the default view.
  const query = parsed.success ? parsed.data : ticketListQuerySchema.parse({});

  const [events, result] = await Promise.all([
    listEvents(ctx),
    listTickets(ctx, query),
  ]);
  const ticketTypes = query.eventId
    ? await listTicketTypes(ctx, query.eventId)
    : [];

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ticket inventory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search serials, filter by event, category or inventory status, and
            open a ticket for its full history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(ctx.role, "inventory:export") && query.eventId ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={exportHref(query)} />}
            >
              <FileDown /> Export CSV
            </Button>
          ) : null}
          {can(ctx.role, "inventory:generate") ? (
            <Button nativeButton={false} size="sm" render={<Link href="/tickets/new" />}>
              <Plus /> Generate tickets
            </Button>
          ) : null}
        </div>
      </div>

      <InventoryFilters
        events={events.map((event) => ({ id: event.id, name: event.name }))}
        ticketTypes={ticketTypes.map((type) => ({
          id: type.id,
          name: type.name,
        }))}
        initial={query}
      />

      <TicketsTable tickets={result.tickets} showEvent={!query.eventId} />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {result.total} {result.total === 1 ? "ticket" : "tickets"} · page{" "}
          {result.page} of {pages}
        </span>
        <span className="flex gap-2">
          {result.page > 1 ? (
            <Link
              href={pageHref(query, result.page - 1)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Previous
            </Link>
          ) : null}
          {result.page < pages ? (
            <Link
              href={pageHref(query, result.page + 1)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Next
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
