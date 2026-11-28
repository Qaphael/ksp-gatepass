import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentForm, ReversePaymentButton, SaleAdminActions } from "@/components/sales/sale-detail-actions";
import { SalePaymentsTable } from "@/components/sales/sale-payments-table";
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
import { DefList, DefRow } from "@/components/ui/def-list";

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
  const canRecordPayment = can(ctx.role, "payment:record");
  const hasPrintableTicket = ticketRows.some((ticket) => ticket.status !== "CANCELLED" && ticket.status !== "REVOKED");
  const maySeeGate = can(ctx.role, "checkin:read-recent");
  const canCollect = outstanding && sale.balanceUgx > 0 && canRecordPayment;

  const totalTickets = sale.items.reduce((sum, item) => sum + item.quantity, 0);
  const admittedTickets = ticketRows.filter((t) => t.checkIn).length;
  const time = (value: string) => formatDateTime(value, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" });
  const stamp = (value: string) => formatDateTime(value, "Africa/Kampala", "en-UG", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Breadcrumb */}
      <Link
        href="/sales"
        className="inline-flex w-fit min-h-11 items-center gap-2 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" /> Back to sales
      </Link>

      {/* Sale header card */}
      <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              Sale {sale.reference}
            </h1>
            <StatusBadge domain="sale" status={sale.status} className="text-xs" />
            <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
              {admittedTickets}/{totalTickets} admitted
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{sale.eventName}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {stamp(sale.createdAt)} EAT
          </p>
        </div>

        {/* Actions: print buttons side by side on phones, all three from sm */}
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
          <Button
            nativeButton={false}
            variant="outline"
            className="min-h-11 w-full justify-center gap-2 px-2 text-sm"
            render={<a href={`/api/v1/sales/${sale.id}/receipt.pdf`} />}
          >
            <Printer className="size-4 shrink-0" aria-hidden="true" /> Print receipt
          </Button>
          {canPrint && hasPrintableTicket ? (
            <Button
              nativeButton={false}
              variant="outline"
              className="min-h-11 w-full justify-center gap-2 px-2 text-sm"
              render={<a href="#sale-tickets" />}
            >
              <Printer className="size-4 shrink-0" aria-hidden="true" /> Print tickets
            </Button>
          ) : <span className="hidden sm:block" aria-hidden="true" />}
          {canCollect ? (
            <Button
              nativeButton={false}
              className="col-span-2 min-h-11 w-full justify-center gap-2 text-sm sm:col-span-1"
              render={<a href="#collect-balance" />}
            >
              Record balance
            </Button>
          ) : <span className="hidden sm:block" aria-hidden="true" />}
        </div>
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
        {/* Left column: ledger, parties, tickets */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Financial ledger */}
          <section aria-label="Financial ledger" className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Financial ledger</h2>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">UGX</span>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-muted/40 p-3">
                <span className="text-[11px] text-muted-foreground">Order total</span>
                <span className="min-w-0 break-words font-mono text-base font-semibold tabular-nums">
                  <Money amount={sale.totalUgx} />
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-muted/40 p-3">
                <span className="text-[11px] text-muted-foreground">Paid to date</span>
                <span className="min-w-0 break-words font-mono text-base font-semibold tabular-nums text-success-foreground">
                  <Money amount={sale.amountPaidUgx} />
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-muted/40 p-3">
                <span className="text-[11px] text-muted-foreground">Balance due</span>
                <span className="min-w-0 break-words font-mono text-base font-semibold tabular-nums">
                  <Money amount={sale.balanceUgx} />
                </span>
              </div>
            </div>
            <p className="border-t border-border/70 pt-2 text-xs text-muted-foreground">
              Subtotal <span className="font-mono font-semibold tabular-nums text-foreground">{formatUGX(sale.subtotalUgx)}</span>
              {sale.discountUgx > 0 ? (
                <> · Discount <span className="font-mono font-semibold tabular-nums text-foreground">{formatUGX(sale.discountUgx)}</span></>
              ) : null}
            </p>
          </section>

          {/* Parties */}
          <section aria-label="Parties" className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-card">
            <DefList>
              <DefRow label="Authorized seller">
                <span className="break-words">{sale.seller.displayName}</span>
              </DefRow>
              <DefRow label="Customer contact">
                <span className="break-words">{sale.customerName ?? "Not provided"}</span>
                {sale.customerPhone ? <span className="ml-1 font-mono text-xs text-muted-foreground">{sale.customerPhone}</span> : null}
              </DefRow>
              {sale.customerReference ? (
                <DefRow label="Customer reference"><span className="break-words">{sale.customerReference}</span></DefRow>
              ) : null}
              {sale.notes ? (
                <DefRow label="Notes"><span className="break-words">{sale.notes}</span></DefRow>
              ) : null}
            </DefList>
          </section>

          {/* Tickets */}
          <section id="sale-tickets" className="min-w-0 scroll-mt-4 rounded-lg border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Itemized passes ({totalTickets})</h2>
              {ticketRows[0]?.ticketTypeName ? (
                <span className="truncate text-xs text-muted-foreground">{ticketRows[0].ticketTypeName}</span>
              ) : null}
            </div>
            <ul className="mt-2 divide-y divide-border">
              {ticketRows.map((ticket) => {
                const checkedIn = ticket.checkIn;
                return (
                  <li key={ticket.id} className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm font-semibold tracking-wider"><Serial>{ticket.serial}</Serial></span>
                        {checkedIn ? (
                          <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-success">ADMITTED</span>
                        ) : (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">ISSUED · PENDING GATE</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {ticket.ticketTypeName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {checkedIn
                          ? checkedIn.gate && maySeeGate
                            ? `${checkedIn.gate} · ${time(checkedIn.checkedInAt)} EAT`
                            : `Admitted · ${time(checkedIn.checkedInAt)} EAT`
                          : "Not yet admitted"}
                      </p>
                    </div>
                    {canPrint ? (
                      <div className="shrink-0">
                        <TicketActions
                          ticketId={ticket.id}
                          serial={ticket.serial}
                          canPrint={canPrint}
                          printable={ticket.status !== "CANCELLED" && ticket.status !== "REVOKED"}
                          hasPrintHistory={printedTicketIds.has(ticket.id)}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {ticketRows.length === 0 ? <li className="py-3 text-sm text-muted-foreground">No tickets on this sale.</li> : null}
            </ul>
          </section>
        </div>

        {/* Right column: collect balance, payments, timeline */}
        <div className="flex min-w-0 flex-col gap-4">
          {canCollect ? (
            <div id="collect-balance" className="min-w-0 scroll-mt-4">
              <PaymentForm saleId={sale.id} balanceUgx={sale.balanceUgx} />
            </div>
          ) : null}

          {/* Payments */}
          <section aria-label="Payment history" className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-card">
            <h2 className="text-base font-semibold">Payment ledger ({sale.payments.length})</h2>

            {/* Phone: stacked rows, no nested card borders */}
            <ul className="mt-2 divide-y divide-border md:hidden">
              {sale.payments.map((payment) => (
                <li key={payment.id} className="flex min-w-0 flex-col gap-1.5 py-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-mono text-sm font-semibold">{payment.reference}</span>
                    <StatusBadge domain="payment" status={payment.status as "RECORDED" | "REVERSED" | "REFUNDED"} className="shrink-0 text-[10px]" />
                  </div>
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{payment.method.replaceAll("_", " ")}</span>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{formatUGX(payment.amountUgx)}</span>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">{stamp(payment.recordedAt)} EAT</p>
                  {payment.externalRef ? <p className="break-words text-xs text-muted-foreground">Ref: {payment.externalRef}</p> : null}
                  {payment.adjustments.map((adjustment) => (
                    <p key={adjustment.id} className="break-words text-xs text-muted-foreground">
                      {adjustment.type.toLowerCase()}: −{formatUGX(adjustment.amountUgx)} · {adjustment.reason}
                    </p>
                  ))}
                  {can(ctx.role, "payment:reverse") && payment.netAmountUgx > 0 ? (
                    <div className="pt-1">
                      <ReversePaymentButton paymentId={payment.id} reference={payment.reference} amountUgx={payment.netAmountUgx} />
                    </div>
                  ) : null}
                </li>
              ))}
              {sale.payments.length === 0 ? <li className="py-3 text-sm text-muted-foreground">No payments recorded.</li> : null}
            </ul>

            {/* Desktop: ReUI DataGrid */}
            <div className="mt-2 hidden md:block">
              <SalePaymentsTable
                canReverse={can(ctx.role, "payment:reverse")}
                payments={sale.payments.map((payment) => ({
                  id: payment.id,
                  reference: payment.reference,
                  recordedAtFormatted: stamp(payment.recordedAt),
                  method: payment.method,
                  amountUgx: payment.amountUgx,
                  netAmountUgx: payment.netAmountUgx,
                  status: payment.status as "RECORDED" | "REVERSED" | "REFUNDED",
                }))}
              />
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Payments are recorded by staff. No provider verification is connected.
            </p>
          </section>

          {/* Timeline */}
          <section aria-label="Transaction timeline" className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-card">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Audit trail</h2>
              <SaleAdminActions
                saleId={sale.id}
                reference={sale.reference}
                totalUgx={sale.totalUgx}
                canCancel={can(ctx.role, "sale:cancel") && outstanding && sale.amountPaidUgx === 0}
                canRefund={can(ctx.role, "sale:refund") && outstanding && sale.amountPaidUgx > 0}
              />
            </div>
            <div className="mt-3">
              <Timeline
                items={auditRows.map((row) => ({
                  id: row.id,
                  time: stamp(new Date(row.createdAt).toISOString()),
                  label: timelineLabel(row.action),
                  detail: row.actorRole ?? undefined,
                }))}
                emptyText="No timeline events."
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
