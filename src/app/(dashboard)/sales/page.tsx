import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { saleListQuerySchema } from "@/lib/validation/sales";
import { listEvents } from "@/server/services/events.service";
import { listSales } from "@/server/services/sales.service";

export const instant = false;
const money = (amount: number) => `UGX ${new Intl.NumberFormat("en-UG").format(amount)}`;

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
        {can(ctx.role, "sale:create") ? <Button size="sm" render={<Link href="/sales/new" />}><Plus /> New sale</Button> : null}
      </div>
      <form className="flex flex-wrap gap-2 rounded-lg border border-border p-3">
        <select name="eventId" defaultValue={query.eventId ?? ""} className="rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select>
        <select name="status" defaultValue={query.status ?? ""} className="rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">All statuses</option>{["PENDING_PAYMENT", "PARTIALLY_PAID", "PAID", "CANCELLED", "REFUNDED"].map((status) => <option key={status}>{status}</option>)}</select>
        <Button size="sm" variant="outline">Filter</Button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{["Reference / event", "Seller", "Tickets", "Total", "Paid", "Balance", "Status"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead>
          <tbody>{result.sales.map((sale) => <tr key={sale.id} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2"><Link className="font-medium underline-offset-2 hover:underline" href={`/sales/${sale.id}`}>{sale.reference}</Link><div className="text-xs text-muted-foreground">{sale.eventName}</div></td>
            <td className="px-3 py-2">{sale.seller.displayName}</td><td className="px-3 py-2">{sale.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
            <td className="px-3 py-2">{money(sale.totalUgx)}</td><td className="px-3 py-2">{money(sale.amountPaidUgx)}</td><td className="px-3 py-2">{money(sale.balanceUgx)}</td>
            <td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-1 text-xs">{sale.status}</span></td>
          </tr>)}
          {result.sales.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No sales found.</td></tr> : null}</tbody>
        </table>
      </div>
      <div className="text-sm text-muted-foreground">{result.total} {result.total === 1 ? "sale" : "sales"} · page {result.page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}</div>
    </div>
  );
}
