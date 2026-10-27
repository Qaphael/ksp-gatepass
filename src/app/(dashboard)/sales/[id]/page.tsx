import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PaymentForm, ReversePaymentButton, SaleAdminActions } from "@/components/sales/sale-detail-actions";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db/client";
import { getSale } from "@/server/services/sales.service";

export const instant = false;
const money = (amount: number) => `UGX ${new Intl.NumberFormat("en-UG").format(amount)}`;

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "sale:read-own") && !can(ctx.role, "sale:read-all")) redirect("/dashboard");
  const { id } = await params;
  let sale;
  try { sale = await getSale(ctx, id); } catch { notFound(); }
  const paymentIds = sale.payments.map((payment) => payment.id);
  const auditRows = await prisma.auditLog.findMany({
    where: { eventId: sale.eventId, OR: [{ targetType: "sale", targetId: sale.id }, ...(paymentIds.length ? [{ targetType: "payment", targetId: { in: paymentIds } }] : [])] },
    orderBy: { createdAt: "asc" }, take: 100,
  });
  const outstanding = sale.status !== "CANCELLED" && sale.status !== "REFUNDED";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link href="/sales" className="text-sm text-muted-foreground underline-offset-2 hover:underline">← Sales</Link><h1 className="mt-1 text-2xl font-semibold tracking-tight">{sale.reference}</h1><p className="text-sm text-muted-foreground">{sale.eventName} · {new Date(sale.createdAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}</p></div>
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-muted px-3 py-1 text-sm">{sale.status}</span><Button nativeButton={false} size="sm" variant="outline" render={<a href={`/api/v1/sales/${sale.id}/receipt.pdf`} />}>Print receipt</Button></div>
      </div>
      <section className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
        <div><div className="text-xs text-muted-foreground">Seller</div><div>{sale.seller.displayName}</div></div>
        <div><div className="text-xs text-muted-foreground">Customer</div><div>{sale.customerName ?? "Not provided"}{sale.customerPhone ? ` · ${sale.customerPhone}` : ""}</div></div>
        {sale.customerReference ? <div><div className="text-xs text-muted-foreground">Customer reference</div><div>{sale.customerReference}</div></div> : null}
        <div><div className="text-xs text-muted-foreground">Subtotal / discount</div><div>{money(sale.subtotalUgx)} / {money(sale.discountUgx)}</div></div>
        <div><div className="text-xs text-muted-foreground">Total</div><div className="font-semibold">{money(sale.totalUgx)}</div></div>
        <div><div className="text-xs text-muted-foreground">Paid / balance</div><div>{money(sale.amountPaidUgx)} / {money(sale.balanceUgx)}</div></div>
        {sale.notes ? <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">Notes</div><div>{sale.notes}</div></div> : null}
      </section>
      <section className="rounded-lg border border-border p-4"><h2 className="font-semibold">Tickets</h2><div className="mt-2 divide-y divide-border">{sale.items.map((item) => <div key={item.id} className="py-3"><div className="flex justify-between gap-3"><span>{item.quantity} × {item.ticketTypeName} at {money(item.unitPriceUgx)}</span><span>{money(item.lineTotalUgx)}</span></div><div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">{item.tickets.map((ticket) => <span key={ticket.id} className="rounded border border-border px-2 py-1">{ticket.serial} · {ticket.status}</span>)}</div></div>)}</div></section>
      <section className="rounded-lg border border-border p-4"><h2 className="font-semibold">Payment history</h2><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-muted-foreground">{["Reference / date", "Method", "Recorded", "Status", "Action"].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{sale.payments.map((payment) => <tr key={payment.id} className="border-t border-border align-top"><td className="px-2 py-2">{payment.reference}<div className="text-xs text-muted-foreground">{new Date(payment.recordedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}{payment.externalRef ? ` · Ref ${payment.externalRef}` : ""}</div></td><td className="px-2 py-2">{payment.method}</td><td className="px-2 py-2">{money(payment.amountUgx)}{payment.adjustments.map((adjustment) => <div key={adjustment.id} className="text-xs text-muted-foreground">{adjustment.type.toLowerCase()}: −{money(adjustment.amountUgx)} · {adjustment.reason}</div>)}</td><td className="px-2 py-2">{payment.status}</td><td className="px-2 py-2">{can(ctx.role, "payment:reverse") && payment.netAmountUgx > 0 ? <ReversePaymentButton paymentId={payment.id} /> : "—"}</td></tr>)}{sale.payments.length === 0 ? <tr><td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">No payments recorded.</td></tr> : null}</tbody></table></div></section>
      {sale.payments.length > 0 ? <section className="rounded-lg border border-border p-4"><h2 className="font-semibold">Recorded by</h2><ul className="mt-2 space-y-2 text-sm">{sale.payments.map((payment) => <li key={payment.id}>{payment.reference}: {payment.recordedByName}{payment.adjustments.map((adjustment) => <span key={adjustment.id} className="text-muted-foreground"> · {adjustment.type.toLowerCase()} by {adjustment.recordedByName}</span>)}</li>)}</ul></section> : null}
      {outstanding && sale.balanceUgx > 0 && can(ctx.role, "payment:record") ? <PaymentForm saleId={sale.id} balanceUgx={sale.balanceUgx} /> : null}
      <section className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Transaction timeline</h2><SaleAdminActions saleId={sale.id} canCancel={can(ctx.role, "sale:cancel") && outstanding && sale.amountPaidUgx === 0} canRefund={can(ctx.role, "sale:refund") && outstanding && sale.amountPaidUgx > 0} /></div><ol className="mt-3 space-y-3">{auditRows.map((row) => <li key={row.id} className="border-l-2 border-border pl-3"><div className="text-sm font-medium">{row.action}</div><div className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })} · {row.actorRole ?? "system"}</div>{row.summary && typeof row.summary === "object" ? <div className="mt-1 text-xs text-muted-foreground">{JSON.stringify(row.summary)}</div> : null}</li>)}{auditRows.length === 0 ? <li className="text-sm text-muted-foreground">No timeline events.</li> : null}</ol></section>
    </div>
  );
}
