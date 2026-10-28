import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { saleListQuerySchema } from "@/lib/validation/sales";
import { listEvents } from "@/server/services/events.service";
import { listSales } from "@/server/services/sales.service";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { Money } from "@/components/ui/money";

export const instant = false;

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "sale:read-own") && !can(ctx.role, "sale:read-all")) redirect("/dashboard");
  const params = await searchParams;
  const query = saleListQuerySchema.parse({
    ...(typeof params.eventId === "string" ? { eventId: params.eventId } : {}),
    ...(typeof params.status === "string" ? { status: params.status } : {}),
    ...(typeof params.page === "string" ? { page: params.page } : {}),
  });
  const [events, result] = await Promise.all([listEvents(ctx), listSales(ctx, query)]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Sales</h1><p className="mt-1 text-sm text-muted-foreground">Recorded transactions, outstanding balances and payment history.</p></div>
        {can(ctx.role, "sale:create") ? <Button nativeButton={false} size="sm" className="min-h-11 text-base" render={<Link href="/sales/new" />}><Plus /> New sale</Button> : null}
      </div>
      <FilterSheet activeCount={[query.eventId, query.status].filter(Boolean).length}><form className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row">
        <label className="grid flex-1 gap-1 text-sm">Event<select name="eventId" defaultValue={query.eventId ?? ""} className="min-h-12 rounded-md border border-input bg-background px-3 text-base"><option value="">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
        <label className="grid flex-1 gap-1 text-sm">Status<select name="status" defaultValue={query.status ?? ""} className="min-h-12 rounded-md border border-input bg-background px-3 text-base"><option value="">All statuses</option>{["PENDING_PAYMENT", "PARTIALLY_PAID", "PAID", "CANCELLED", "REFUNDED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
        <Button size="sm" variant="outline" className="min-h-12 text-base">Filter</Button>
      </form></FilterSheet>
      <ResponsiveList cards={result.sales.map((sale) => <Link key={sale.id} href={`/sales/${sale.id}`} className="block rounded-xl border border-border bg-card p-4 active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{sale.reference}</p><p className="truncate text-sm text-muted-foreground">{sale.eventName}</p></div><StatusBadge domain="sale" status={sale.status} /></div>
        <p className="mt-3 text-sm">{sale.items.reduce((sum, item) => sum + item.quantity, 0)} tickets · {sale.seller.displayName}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><span>Total <Money amount={sale.totalUgx} /></span><span>Paid <Money amount={sale.amountPaidUgx} /></span><span className="col-span-2 text-muted-foreground">Balance <Money amount={sale.balanceUgx} /></span></div>
      </Link>)} table={<div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{["Reference / event", "Seller", "Tickets", "Total", "Paid", "Balance", "Status"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead>
          <tbody>{result.sales.map((sale) => <tr key={sale.id} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2"><Link className="font-medium underline-offset-2 hover:underline" href={`/sales/${sale.id}`}>{sale.reference}</Link><div className="text-xs text-muted-foreground">{sale.eventName}</div></td>
            <td className="px-3 py-2">{sale.seller.displayName}</td><td className="px-3 py-2">{sale.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
            <td className="px-3 py-2"><Money amount={sale.totalUgx} /></td><td className="px-3 py-2"><Money amount={sale.amountPaidUgx} /></td><td className="px-3 py-2"><Money amount={sale.balanceUgx} /></td>
            <td className="px-3 py-2"><StatusBadge domain="sale" status={sale.status} /></td>
          </tr>)}
          {result.sales.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No sales found.</td></tr> : null}</tbody>
        </table>
      </div>} />
      {result.sales.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><p className="text-base font-medium">No sales match these filters.</p><Link className="mt-2 inline-flex min-h-11 items-center underline" href="/sales">Clear filters</Link></div>}
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{result.total} {result.total === 1 ? "sale" : "sales"} · page {result.page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}</span><div className="flex gap-2">{result.page > 1 && <Link className="inline-flex min-h-11 items-center rounded border px-3 md:hidden" href={`/sales?${new URLSearchParams({ ...(query.eventId ? { eventId: query.eventId } : {}), ...(query.status ? { status: query.status } : {}), page: String(result.page - 1) })}`}>Previous</Link>}{result.page < Math.ceil(result.total / result.pageSize) && <Link className="inline-flex min-h-11 items-center rounded border px-3" href={`/sales?${new URLSearchParams({ ...(query.eventId ? { eventId: query.eventId } : {}), ...(query.status ? { status: query.status } : {}), page: String(result.page + 1) })}`}><span className="md:hidden">Load more</span><span className="hidden md:inline">Next</span></Link>}</div></div>
    </div>
  );
}
