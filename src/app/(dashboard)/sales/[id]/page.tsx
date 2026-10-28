import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentForm, ReversePaymentButton, SaleAdminActions } from "@/components/sales/sale-detail-actions";
import { TicketActions } from "@/components/tickets/ticket-actions";
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
  const ticketRows = sale.items.flatMap((item) => item.tickets.map((ticket) => ({ ...ticket, ticketTypeName: item.ticketTypeName })));
  const ticketIds = ticketRows.map((ticket) => ticket.id);
  const [auditRows, printRows] = await Promise.all([
    prisma.auditLog.findMany({
      where: { eventId: sale.eventId, OR: [{ targetType: "sale", targetId: sale.id }, ...(sale.payments.length ? [{ targetType: "payment", targetId: { in: sale.payments.map((payment) => payment.id) } }] : [])] },
      orderBy: { createdAt: "asc" }, take: 100,
    }),
    ticketIds.length ? prisma.printBatch.findMany({ where: { ticketId: { in: ticketIds } }, select: { ticketId: true } }) : Promise.resolve([]),
  ]);
  const printedTicketIds = new Set(printRows.flatMap((row) => row.ticketId ? [row.ticketId] : []));
  const outstanding = sale.status !== "CANCELLED" && sale.status !== "REFUNDED";
  const canPrint = can(ctx.role, "ticket:print");
  const hasPrintableTicket = ticketRows.some((ticket) => ticket.status !== "CANCELLED" && ticket.status !== "REVOKED");
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><Link href="/sales" className="inline-flex min-h-11 items-center text-base text-muted-foreground underline-offset-2 hover:underline">← Sales</Link><h1 className="mt-1 text-2xl font-semibold tracking-tight">Sale {sale.reference}</h1><p className="text-base text-muted-foreground">{sale.eventName} · {new Date(sale.createdAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}</p><p className="mt-2 inline-flex min-h-8 items-center rounded-full border px-3 text-base font-medium">✓ Sale recorded · {sale.status.replaceAll("_", " ")}</p></div>
      <div className="flex flex-wrap gap-2">{canPrint && hasPrintableTicket ? <Button nativeButton={false} className="min-h-12" render={<a href="#sale-tickets" />}><Printer /> Print tickets</Button> : null}<Button nativeButton={false} className="min-h-12" variant="outline" render={<a href={`/api/v1/sales/${sale.id}/receipt.pdf`} />}>Print receipt</Button></div>
    </div>
    <section className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <div><div className="text-base text-muted-foreground">Seller</div><div>{sale.seller.displayName}</div></div>
      <div><div className="text-base text-muted-foreground">Customer</div><div>{sale.customerName ?? "Not provided"}{sale.customerPhone ? ` · ${sale.customerPhone}` : ""}</div></div>
      {sale.customerReference ? <div><div className="text-base text-muted-foreground">Customer reference</div><div>{sale.customerReference}</div></div> : null}
      <div><div className="text-base text-muted-foreground">Subtotal / discount</div><div>{money(sale.subtotalUgx)} / {money(sale.discountUgx)}</div></div>
      <div><div className="text-base text-muted-foreground">Total</div><div className="font-semibold">{money(sale.totalUgx)}</div></div>
      <div><div className="text-base text-muted-foreground">Paid / balance</div><div>{money(sale.amountPaidUgx)} / {money(sale.balanceUgx)}</div></div>
      {sale.notes ? <div className="sm:col-span-2"><div className="text-base text-muted-foreground">Notes</div><div>{sale.notes}</div></div> : null}
    </section>
    <section id="sale-tickets" className="scroll-mt-4 rounded-lg border border-border p-4"><h2 className="text-lg font-semibold">Tickets</h2><div className="mt-2 divide-y divide-border">{sale.items.map((item) => <div key={item.id} className="py-3"><div className="flex justify-between gap-3 text-base"><span>{item.quantity} × {item.ticketTypeName} at {money(item.unitPriceUgx)}</span><span>{money(item.lineTotalUgx)}</span></div><ul className="mt-2 divide-y">{item.tickets.map((ticket) => <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 py-2"><div><p className="font-mono text-base font-semibold tracking-wider">{ticket.serial}</p><p className="text-base text-muted-foreground">{ticket.status.replaceAll("_", " ")}</p></div>{canPrint ? <TicketActions ticketId={ticket.id} serial={ticket.serial} canPrint={canPrint} printable={ticket.status !== "CANCELLED" && ticket.status !== "REVOKED"} hasPrintHistory={printedTicketIds.has(ticket.id)} /> : null}</li>)}</ul></div>)}</div></section>
    <section className="rounded-lg border border-border p-4"><h2 className="text-lg font-semibold">Payment history</h2><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-base"><thead><tr className="text-muted-foreground">{["Reference / date", "Method", "Recorded", "Status", "Action"].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{sale.payments.map((payment) => <tr key={payment.id} className="border-t border-border align-top"><td className="px-2 py-2">{payment.reference}<div className="text-base text-muted-foreground">{new Date(payment.recordedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}{payment.externalRef ? ` · Ref ${payment.externalRef}` : ""}</div></td><td className="px-2 py-2">{payment.method.replaceAll("_", " ")}</td><td className="px-2 py-2">{money(payment.amountUgx)}{payment.adjustments.map((adjustment) => <div key={adjustment.id} className="text-base text-muted-foreground">{adjustment.type.toLowerCase()}: −{money(adjustment.amountUgx)} · {adjustment.reason}</div>)}</td><td className="px-2 py-2">{payment.status}</td><td className="px-2 py-2">{can(ctx.role, "payment:reverse") && payment.netAmountUgx > 0 ? <ReversePaymentButton paymentId={payment.id} reference={payment.reference} amountUgx={payment.netAmountUgx} /> : "—"}</td></tr>)}</tbody></table></div>{sale.payments.length === 0 && <p className="py-5 text-center text-base text-muted-foreground">No payments recorded.</p>}</section>
    {sale.payments.length > 0 ? <section className="rounded-lg border border-border p-4"><h2 className="text-lg font-semibold">Recorded by</h2><ul className="mt-2 space-y-2 text-base">{sale.payments.map((payment) => <li key={payment.id}>{payment.reference}: {payment.recordedByName}{payment.adjustments.map((adjustment) => <span key={adjustment.id} className="text-muted-foreground"> · {adjustment.type.toLowerCase()} by {adjustment.recordedByName}</span>)}</li>)}</ul></section> : null}
    {outstanding && sale.balanceUgx > 0 && can(ctx.role, "payment:record") ? <PaymentForm saleId={sale.id} balanceUgx={sale.balanceUgx} /> : null}
    <section className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Transaction timeline</h2><SaleAdminActions saleId={sale.id} reference={sale.reference} totalUgx={sale.totalUgx} canCancel={can(ctx.role, "sale:cancel") && outstanding && sale.amountPaidUgx === 0} canRefund={can(ctx.role, "sale:refund") && outstanding && sale.amountPaidUgx > 0} /></div><ol className="mt-3 space-y-3">{auditRows.map((row) => <li key={row.id} className="border-l-2 border-border pl-3"><div className="text-base font-medium">{row.action}</div><div className="text-base text-muted-foreground">{new Date(row.createdAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })} · {row.actorRole ?? "system"}</div>{row.summary && typeof row.summary === "object" ? <div className="mt-1 text-base text-muted-foreground">{JSON.stringify(row.summary)}</div> : null}</li>)}{auditRows.length === 0 ? <li className="text-base text-muted-foreground">No timeline events.</li> : null}</ol></section>
  </div>;
}
