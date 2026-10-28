import type { AuthContext } from "@/lib/auth/session";
import { localToUtc } from "@/lib/time";
import { prisma } from "@/lib/db/client";
import { requirePermission } from "./errors";
import { getEvent } from "./events.service";

function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function localDayBounds(now: Date, timezone: string) {
  const today = localDate(now, timezone);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    today,
    start: localToUtc(`${today}T00:00`, timezone),
    end: localToUtc(`${tomorrow}T00:00`, timezone),
  };
}

export async function getSellerDashboardMetrics(ctx: AuthContext, eventId: string) {
  requirePermission(ctx.role, "sale:read-own");
  const event = await getEvent(ctx, eventId);
  const { today, start, end } = localDayBounds(new Date(), event.timezone);
  const saleScope = { eventId, sellerId: ctx.userId };
  const [sales, payments, adjustments, outstandingSales] = await Promise.all([
    prisma.sale.aggregate({
      where: { ...saleScope, createdAt: { gte: start, lt: end }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
      _count: { _all: true },
      _sum: { totalUgx: true },
    }),
    prisma.payment.aggregate({
      where: { sale: saleScope, recordedAt: { gte: start, lt: end } },
      _sum: { amountUgx: true },
    }),
    prisma.paymentAdjustment.groupBy({
      by: ["type"],
      where: { payment: { sale: saleScope }, createdAt: { gte: start, lt: end } },
      _sum: { amountUgx: true },
    }),
    prisma.sale.findMany({
      where: { ...saleScope, status: { in: ["PENDING_PAYMENT", "PARTIALLY_PAID"] } },
      select: { totalUgx: true, payments: { select: { amountUgx: true, adjustments: { select: { amountUgx: true } } } } },
    }),
  ]);
  const received = payments._sum.amountUgx ?? 0;
  const adjusted = adjustments.reduce((sum, item) => sum + (item._sum.amountUgx ?? 0), 0);
  const outstandingUgx = outstandingSales.reduce((sum, sale) => {
    const paid = sale.payments.reduce(
      (paymentSum, payment) => paymentSum + payment.amountUgx - payment.adjustments.reduce((adjustmentSum, adjustment) => adjustmentSum + adjustment.amountUgx, 0),
      0,
    );
    return sum + Math.max(0, sale.totalUgx - paid);
  }, 0);

  return {
    day: today,
    salesCount: sales._count._all,
    salesValueUgx: sales._sum.totalUgx ?? 0,
    receivedNetUgx: received - adjusted,
    outstandingUgx,
    outstandingSalesCount: outstandingSales.length,
  };
}

export async function getDailyAdmissionCount(ctx: AuthContext, eventId: string) {
  requirePermission(ctx.role, "checkin:read-summary");
  const event = await getEvent(ctx, eventId);
  const { today, start, end } = localDayBounds(new Date(), event.timezone);
  const count = await prisma.checkIn.count({ where: { eventId, checkedInAt: { gte: start, lt: end } } });
  return { day: today, count };
}

export async function getTicketTypeProgress(ctx: AuthContext, eventId: string) {
  requirePermission(ctx.role, "ticket-type:read");
  await getEvent(ctx, eventId);
  const [ticketTypes, soldRows, availableRows] = await Promise.all([
    prisma.ticketType.findMany({ where: { eventId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, allocationLimit: true } }),
    prisma.ticket.groupBy({ by: ["ticketTypeId"], where: { eventId, status: "SOLD" }, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["ticketTypeId"], where: { eventId, status: "AVAILABLE" }, _count: { _all: true } }),
  ]);
  const sold = new Map(soldRows.map((row) => [row.ticketTypeId, row._count._all]));
  const available = new Map(availableRows.map((row) => [row.ticketTypeId, row._count._all]));
  return ticketTypes.map((type) => {
    const soldCount = sold.get(type.id) ?? 0;
    const availableCount = available.get(type.id) ?? 0;
    const total = type.allocationLimit ?? soldCount + availableCount;
    return { id: type.id, name: type.name, sold: soldCount, remaining: Math.max(0, total - soldCount), total };
  });
}
