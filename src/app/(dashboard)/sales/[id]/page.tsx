import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentForm, ReversePaymentButton, SaleAdminActions } from "@/components/sales/sale-detail-actions";
import { TicketActions } from "@/components/tickets/ticket-actions";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db/client";
import { getSale } from "@/server/services/sales.service";
import { formatUGX } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { Timeline } from "@/components/ui/timeline";
import { Serial } from "@/components/ui/serial";
import { formatDateTime } from "@/lib/time";
import { Money } from "@/components/ui/money";

export const instant = false;

function timelineLabel(action: string): string {
  const labels: Record<string, string> = {
    "sale.create": "Sale created",
    "payment.record": "Payment recorded",
    "payment.reverse": "Payment reversed",
    "payment.refund": "Payment refunded",
    "sale.cancel": "Sale cancelled",
    "sale.refund": "Sale refunded",
    "ticket.print": "Ticket printed",
    "ticket.reprint": "Ticket reprinted",
    "ticket.revoke": "Ticket revoked",
    "sale.ticket.lookup": "Ticket lookup",
  };
  return labels[action] ?? action;
}

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
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
  const maySeeGate = can(ctx.role, "checkin:read-recent");

  const totalTickets = sale.items.reduce((sum, item) => sum + item.quantity, 0);
  const admittedTickets = ticketRows.filter((t) => t.checkIn).length;
  const time = (value: string) => formatDateTime(value, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" });
  const dayTime = (value: string) => formatDateTime(value, "Africa/Kampala", "en-UG", { month: "short", day: "2-digit", year: "numeric" });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/sales" className="inline-flex min-h-11 items-center text-base text-muted-foreground underline-offset-2 hover:underline">
            <ArrowLeft className="size-4 shrink-0 mr-2" aria-hidden="true" /> Back to Sales
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            Sale {sale.reference}
            <StatusBadge domain="sale" status={sale.status} className="text-xs px-2" />
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-card/50 text-muted-foreground font-mono text-[10px] font-semibold">
              {admittedTickets}/{totalTickets} admitted
            </span>
          </h1>
          <p className="text-base text-muted-foreground">{sale.eventName} · {dayTime(sale.createdAt)}</p>
          <p className="mt-1 text-xs text-muted-foreground">EAT UTC+3 (Kampala) · {time(sale.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPrint && hasPrintableTicket ? (
            <Button nativeButton={false} className="min-h-12" render={<a href="#sale-tickets" />}>
              <Printer /> Print tickets
            </Button>
          ) : null}
          <Button nativeButton={false} className="min-h-12" variant="outline" render={<a href={`/api/v1/sales/${sale.id}/receipt.pdf`} />}>
            Print receipt
          </Button>
          {outstanding && sale.balanceUgx > 0 && can(ctx.role, "payment:record") ? (
            <Button nativeButton={false} className="min-h-12" render={<a href="#collect-balance" />}>
              Record Balance
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {/* Left column: ledger + parties + tickets */}
        <div className="flex flex-col gap-4">
          {/* Financial ledger tile */}
          <section className="rounded-lg border border-border p-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order total</span>
                <span className="font-mono text-base font-semibold tabular-nums"><Money amount={sale.totalUgx} /></span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid to date</span>
                <span className="font-mono text-base font-semibold tabular-nums text-success-foreground"><Money amount={sale.amountPaidUgx} /></span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground">Balance due</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">AT GATE</span>
                </span>
                <span className="font-mono text-base font-semibold tabular-nums text-muted-foreground"><Money amount={sale.balanceUgx} /></span>
              </div>
              <div className="pt-2 border-t border-border/70">
                <p className="text-xs text-muted-foreground">
                  Subtotal <span className="font-mono text-xs font-semibold tabular-nums">{formatUGX(sale.subtotalUgx)}</span>
                  &nbsp;·&nbsp;
                  Discount <span className="font-mono text-xs font-semibold tabular-nums">{formatUGX(sale.discountUgx)}</span>
                </p>
              </div>
            </div>
          </section>

          {/* Secondary meta: seller + customer cards */}
          <section className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-4 flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Authorized seller</span>
              <div className="text-base font-semibold">{sale.seller.displayName}</div>
            </div>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Customer contact</span>
              <div className="text-base font-semibold truncate">{sale.customerName ?? "Not provided"}</div>
              {sale.customerPhone ? <div className="text-xs text-muted-foreground">{sale.customerPhone}</div> : null}
            </div>
          </section>

          {/* Tickets */}
          <section id="sale-tickets" className="scroll-mt-4 rounded-lg border border-border p-4">
            <h2 className="text-lg font-semibold">Itemized Passes ({totalTickets})</h2>
            <div className="mt-2 divide-y divide-border">
              {sale.items.map((item) => (
                <div key={item.id} className="py-3">
                  <div className="flex justify-between gap-3 text-base">
                    <span>{item.quantity} × {item.ticketTypeName}</span>
                    <span>{formatUGX(item.lineTotalUgx)}</span>
                  </div>
                  <ul className="mt-2 divide-y">
                    {item.tickets.map((ticket) => {
                      const checkedIn = ticket.checkIn;
                      return (
                        <li key={ticket.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-base font-semibold tracking-wider"><Serial>{ticket.serial}</Serial></span>
                              {checkedIn ? (
                                <span className="px-1.5 py-0.5 rounded bg-success/10 text-success font-mono text-[10px] font-semibold">ADMITTED</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px] font-semibold">ISSUED · PENDING GATE</span>
                              )}
                            </div>
                            <p className="text-base text-muted-foreground">{item.ticketTypeName} · {formatUGX(item.unitPriceUgx)}</p>
                            {checkedIn && maySeeGate ? (
                              <span className="text-xs text-muted-foreground">Gate · {time(checkedIn.checkedInAt)}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Unchecked · Gate pass active</span>
                            )}
                          </div>
                          {canPrint ? (
                            <TicketActions ticketId={ticket.id} serial={ticket.serial} canPrint={canPrint} printable={ticket.status !== "CANCELLED" && ticket.status !== "REVOKED"} hasPrintHistory={printedTicketIds.has(ticket.id)} />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Quick POS payment collection */}
          {outstanding && sale.balanceUgx > 0 && can(ctx.role, "payment:record") ? (
            <section id="collect-balance" className="rounded-lg border border-border p-4">
              <h2 className="text-lg font-semibold">Collect Outstanding Balance</h2>
              <span className="text-xs text-muted-foreground mb-2 block">Due: <span className="font-mono text-base font-semibold tabular-nums text-tertiary">{formatUGX(sale.balanceUgx)}</span></span>
              <PaymentForm saleId={sale.id} balanceUgx={sale.balanceUgx} />
            </section>
          ) : null}
        </div>

        {/* Right column: payments + timeline */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          {/* Payments */}
          <section className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold">Payment Ledger ({sale.payments.length})</h2>
            </div>
            <div className="mt-3 grid gap-3 md:hidden">
              {sale.payments.map((payment) => (
                <article key={payment.id} className="grid gap-2 rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{payment.reference}</p>
                      <p className="text-base text-muted-foreground">{new Date(payment.recordedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}</p>
                    </div>
                    <StatusBadge domain="payment" status={payment.status as "RECORDED" | "REVERSED" | "REFUNDED"} className="text-xs" />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-base">
                    <div>
                      <dt className="text-muted-foreground">Method</dt>
                      <dd>{payment.method.replaceAll("_", " ")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Recorded</dt>
                      <dd className="font-semibold tabular-nums">{formatUGX(payment.amountUgx)}</dd>
                    </div>
                  </dl>
                  {payment.externalRef ? <p className="break-words text-base text-muted-foreground">Reference: {payment.externalRef}</p> : null}
                  {payment.adjustments.map((adjustment) => (
                    <p key={adjustment.id} className="break-words text-base text-muted-foreground">{adjustment.type.toLowerCase()}: −{formatUGX(adjustment.amountUgx)} · {adjustment.reason}</p>
                  ))}
                  {can(ctx.role, "payment:reverse") && payment.netAmountUgx > 0 ? (
                    <ReversePaymentButton paymentId={payment.id} reference={payment.reference} amountUgx={payment.netAmountUgx} />
                  ) : null}
                </article>
              ))}
              {sale.payments.length === 0 && <p className="text-base text-muted-foreground">No payments recorded.</p>}
            </div>
            <div className="mt-2 hidden overflow-x-auto md:block">
              <table className="w-full text-left text-base">
                <thead>
                  <tr className="text-muted-foreground">
                    {["Reference / date", "Method", "Recorded", "Status", "Action"].map((label) => (
                      <th key={label} className="px-2 py-2 font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sale.payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-border align-top">
                      <td className="px-2 py-2">
                        {payment.reference}
                        <div className="text-base text-muted-foreground">{new Date(payment.recordedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}</div>
                      </td>
                      <td className="px-2 py-2">{payment.method.replaceAll("_", " ")}</td>
                      <td className="px-2 py-2"><StatusBadge domain="payment" status={payment.status as "RECORDED" | "REVERSED" | "REFUNDED"} className="text-xs" /></td>
                      <td className="px-2 py-2 text-right">
                        {can(ctx.role, "payment:reverse") && payment.netAmountUgx > 0 ? <ReversePaymentButton paymentId={payment.id} reference={payment.reference} amountUgx={payment.netAmountUgx} /> : null}
                      </td>
                    </tr>
                  ))}
                  {sale.payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">
                        No payments recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Payments are recorded by staff. No provider verification is connected.
            </p>
          </section>

          {/* Timeline */}
          <section className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Audit Trail &amp; Admissions</h2>
              <SaleAdminActions saleId={sale.id} reference={sale.reference} totalUgx={sale.totalUgx} canCancel={can(ctx.role, "sale:cancel") && outstanding && sale.amountPaidUgx === 0} canRefund={can(ctx.role, "sale:refund") && outstanding && sale.amountPaidUgx > 0} />
            </div>
            <Timeline
              items={auditRows.map((row) => ({
                id: row.id,
                time: new Date(row.createdAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" }),
                label: timelineLabel(row.action),
                detail: row.actorRole ? `${row.actorRole ?? "system"}` : undefined,
              }))}
              emptyText="No timeline events."
            />
          </section>
        </div>
      </div>
    </div>
  );
}
