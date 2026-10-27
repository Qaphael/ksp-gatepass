import type { AuthContext } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";
import { localToUtc } from "@/lib/time";
import { can } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { buildCsv } from "@/lib/csv";
import { prisma } from "@/lib/db/client";
import type { ReportExportQuery, ReportQuery } from "@/lib/validation/reports";
import { forbidden, notFound, requirePermission } from "./errors";

type Cell = string | number | null;
export interface ReportData { type: ReportQuery["type"]; eventId: string; eventName: string; title: string; columns: string[]; rows: Cell[][]; generatedAt: string; }
export const REPORT_TITLES: Record<ReportQuery["type"], string> = {
  TICKET_INVENTORY: "Ticket inventory summary", SALES_BY_CATEGORY: "Ticket sales by category",
  SALES_BY_SELLER: "Sales by seller", SALES_BY_DATE: "Sales by date",
  PAYMENTS_BY_METHOD: "Payment totals by method", OUTSTANDING_BALANCES: "Outstanding balances",
  CANCELLATIONS_REFUNDS: "Cancelled sales and refunds", PRINT_HISTORY: "Ticket print history",
  ATTENDANCE_BY_GATE: "Attendance by time and gate", SCAN_ATTEMPTS: "Scan attempts by outcome",
  SOLD_NOT_CHECKED_IN: "Tickets sold but not checked in", RECONCILIATION: "Full event reconciliation",
};

const SUMMARY_REPORTS = new Set<ReportQuery["type"]>([
  "TICKET_INVENTORY", "SALES_BY_CATEGORY", "SALES_BY_DATE", "PAYMENTS_BY_METHOD",
  "ATTENDANCE_BY_GATE", "SCAN_ATTEMPTS", "RECONCILIATION",
]);
const SELLER_REPORTS = new Set<ReportQuery["type"]>([
  "SALES_BY_CATEGORY", "SALES_BY_DATE", "OUTSTANDING_BALANCES", "CANCELLATIONS_REFUNDS",
]);

function dateRange(query: ReportQuery, timezone: string) {
  return {
    ...(query.from ? { gte: localToUtc(`${query.from}T00:00`, timezone) } : {}),
    ...(query.to ? { lt: localToUtc(`${new Date(Date.parse(`${query.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T00:00`, timezone) } : {}),
  };
}
function fmtDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function hourLabel(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:00`;
}
function report(type: ReportQuery["type"], title: string, columns: string[], rows: Cell[][], event: { id: string; name: string }): ReportData {
  return { type, eventId: event.id, eventName: event.name, title, columns, rows, generatedAt: new Date().toISOString() };
}
function by<T>(items: T[], key: (item: T) => string) {
  const result = new Map<string, T[]>();
  for (const item of items) { const k = key(item); result.set(k, [...(result.get(k) ?? []), item]); }
  return result;
}
function availableToView(ctx: AuthContext, type: ReportQuery["type"]) {
  if (can(ctx.role, "report:export-full")) return;
  if (can(ctx.role, "report:view-summary") && SUMMARY_REPORTS.has(type)) return;
  if (can(ctx.role, "report:export-own") && SELLER_REPORTS.has(type)) return;
  throw forbidden();
}

export function availableReports(ctx: AuthContext) {
  return (Object.keys(REPORT_TITLES) as ReportQuery["type"][]).filter((type) => {
    if (can(ctx.role, "report:export-full")) return true;
    if (can(ctx.role, "report:view-summary")) return SUMMARY_REPORTS.has(type);
    if (can(ctx.role, "report:export-own")) return SELLER_REPORTS.has(type);
    return false;
  }).map((type) => ({ type, title: REPORT_TITLES[type] }));
}

export async function getReport(ctx: AuthContext, query: ReportQuery): Promise<ReportData> {
  requirePermission(ctx.role, "event:read");
  availableToView(ctx, query.type);
  const event = await prisma.event.findUnique({ where: { id: query.eventId }, select: { id: true, name: true, timezone: true } });
  if (!event) throw notFound("Event not found.");
  const range = dateRange(query, event.timezone);
  const saleWhere = { eventId: event.id, ...(can(ctx.role, "report:export-own") && !can(ctx.role, "report:export-full") ? { sellerId: ctx.userId } : {}), ...(Object.keys(range).length ? { createdAt: range } : {}) };
  const sellerScope = can(ctx.role, "report:export-own") && !can(ctx.role, "report:export-full") ? ctx.userId : undefined;

  switch (query.type) {
    case "TICKET_INVENTORY": {
      const tickets = await prisma.ticket.findMany({ where: { eventId: event.id }, select: { status: true, ticketType: { select: { name: true } } } });
      const grouped = by(tickets, (t) => `${t.ticketType.name}\0${t.status}`);
      const rows = [...grouped].map(([key, values]) => { const [category, status] = key.split("\0"); return [category, status, values.length]; });
      return report(query.type, REPORT_TITLES[query.type], ["Category", "Inventory status", "Tickets"], rows, event);
    }
    case "SALES_BY_CATEGORY": {
      const sales = await prisma.sale.findMany({ where: { ...saleWhere, status: { notIn: ["CANCELLED", "REFUNDED"] } }, select: { subtotalUgx: true, discountUgx: true, items: { select: { quantity: true, lineTotalUgx: true, ticketType: { select: { name: true } } } } } });
      const totals = new Map<string, { qty: number; gross: number; discounts: number; net: number }>();
      for (const sale of sales) {
        let subtotalSoFar = 0;
        for (const item of sale.items) {
          // Cumulative proportional allocation preserves the sale discount exactly.
          const before = Math.floor(sale.discountUgx * subtotalSoFar / Math.max(1, sale.subtotalUgx));
          subtotalSoFar += item.lineTotalUgx;
          const after = Math.floor(sale.discountUgx * subtotalSoFar / Math.max(1, sale.subtotalUgx));
          const discount = Math.max(0, after - before);
          const old = totals.get(item.ticketType.name) ?? { qty: 0, gross: 0, discounts: 0, net: 0 };
          old.qty += item.quantity; old.gross += item.lineTotalUgx; old.discounts += discount; old.net += item.lineTotalUgx - discount; totals.set(item.ticketType.name, old);
        }
      }
      return report(query.type, REPORT_TITLES[query.type], ["Category", "Tickets sold", "Gross UGX", "Discounts UGX", "Net sales UGX"], [...totals].map(([name, x]) => [name, x.qty, x.gross, x.discounts, x.net]), event);
    }
    case "SALES_BY_SELLER": {
      const sales = await prisma.sale.findMany({ where: { ...saleWhere, status: { notIn: ["CANCELLED", "REFUNDED"] } }, select: { seller: { select: { displayName: true } }, totalUgx: true, subtotalUgx: true, discountUgx: true, status: true } });
      const groups = by(sales, (s) => s.seller.displayName);
      return report(query.type, REPORT_TITLES[query.type], ["Seller", "Sales", "Gross UGX", "Discounts UGX", "Net sales UGX"], [...groups].map(([name, list]) => [name, list.length, list.reduce((a, s) => a + s.subtotalUgx, 0), list.reduce((a, s) => a + s.discountUgx, 0), list.reduce((a, s) => a + s.totalUgx, 0)]), event);
    }
    case "SALES_BY_DATE": {
      const sales = await prisma.sale.findMany({ where: { ...saleWhere, status: { notIn: ["CANCELLED", "REFUNDED"] } }, select: { createdAt: true, subtotalUgx: true, discountUgx: true, totalUgx: true, items: { select: { quantity: true } } } });
      const groups = by(sales, (s) => fmtDate(s.createdAt, event.timezone));
      return report(query.type, REPORT_TITLES[query.type], ["Date", "Sales", "Tickets", "Gross UGX", "Discounts UGX", "Net sales UGX"], [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => [day, list.length, list.reduce((a, s) => a + s.items.reduce((n, i) => n + i.quantity, 0), 0), list.reduce((a, s) => a + s.subtotalUgx, 0), list.reduce((a, s) => a + s.discountUgx, 0), list.reduce((a, s) => a + s.totalUgx, 0)]), event);
    }
    case "PAYMENTS_BY_METHOD": {
      const payments = await prisma.payment.findMany({ where: { sale: { eventId: event.id, ...(sellerScope ? { sellerId: sellerScope } : {}) }, ...(Object.keys(range).length ? { recordedAt: range } : {}) }, select: { method: true, amountUgx: true, adjustments: { where: Object.keys(range).length ? { createdAt: range } : {}, select: { amountUgx: true, type: true } } } });
      const groups = by(payments, (p) => p.method);
      return report(query.type, REPORT_TITLES[query.type], ["Method", "Payments recorded UGX", "Reversals UGX", "Refunds UGX", "Net recorded UGX", "Actual cash counted UGX"], [...groups].map(([method, list]) => {
        const recorded = list.reduce((n, p) => n + p.amountUgx, 0); const reversals = list.reduce((n, p) => n + p.adjustments.filter((a) => a.type === "REVERSAL").reduce((s, a) => s + a.amountUgx, 0), 0); const refunds = list.reduce((n, p) => n + p.adjustments.filter((a) => a.type === "REFUND").reduce((s, a) => s + a.amountUgx, 0), 0);
        return [method, recorded, reversals, refunds, recorded - reversals - refunds, "Not recorded"];
      }), event);
    }
    case "OUTSTANDING_BALANCES": {
      const sales = await prisma.sale.findMany({ where: { ...saleWhere, status: { in: ["PENDING_PAYMENT", "PARTIALLY_PAID"] } }, select: { reference: true, seller: { select: { displayName: true } }, totalUgx: true, payments: { select: { amountUgx: true, adjustments: { select: { amountUgx: true } } } } } });
      const rows = sales.map((s) => { const paid = s.payments.reduce((n, p) => n + p.amountUgx - p.adjustments.reduce((a, x) => a + x.amountUgx, 0), 0); return [s.reference, s.seller.displayName, s.totalUgx, paid, s.totalUgx - paid]; });
      return report(query.type, REPORT_TITLES[query.type], ["Sale reference", "Seller", "Total UGX", "Paid UGX", "Balance UGX"], rows, event);
    }
    case "CANCELLATIONS_REFUNDS": {
      const cancellationsWhere: Prisma.SaleWhereInput = { eventId: event.id, ...(sellerScope ? { sellerId: sellerScope } : {}), status: { in: ["CANCELLED", "REFUNDED"] }, ...(Object.keys(range).length ? { updatedAt: range } : {}) };
      const sales = await prisma.sale.findMany({ where: cancellationsWhere, orderBy: { updatedAt: "desc" }, select: { reference: true, status: true, totalUgx: true, updatedAt: true, seller: { select: { displayName: true } }, payments: { select: { adjustments: { select: { type: true, amountUgx: true } } } } } });
      return report(query.type, REPORT_TITLES[query.type], ["Sale reference", "Status", "Seller", "Total UGX", "Refunds UGX", "Reversals UGX", "Updated"], sales.map((s) => [s.reference, s.status, s.seller.displayName, s.totalUgx, s.payments.flatMap((p) => p.adjustments).filter((a) => a.type === "REFUND").reduce((n, a) => n + a.amountUgx, 0), s.payments.flatMap((p) => p.adjustments).filter((a) => a.type === "REVERSAL").reduce((n, a) => n + a.amountUgx, 0), s.updatedAt.toISOString()]), event);
    }
    case "PRINT_HISTORY": {
      const batches = await prisma.printBatch.findMany({ where: { eventId: event.id, ...(Object.keys(range).length ? { createdAt: range } : {}) }, orderBy: { createdAt: "desc" }, select: { kind: true, ticketCount: true, createdAt: true, actorId: true, metadata: true, ticket: { select: { serial: true } }, ticketBatch: { select: { batchRef: true } } } });
      const users = await prisma.user.findMany({ where: { id: { in: [...new Set(batches.map((b) => b.actorId).filter((id): id is string => Boolean(id)))] } }, select: { id: true, displayName: true } });
      const actorNames = new Map(users.map((u) => [u.id, u.displayName]));
      return report(query.type, REPORT_TITLES[query.type], ["Time", "Print type", "Batch / ticket", "Tickets", "Staff"], batches.map((b) => [b.createdAt.toISOString(), b.kind, b.ticket?.serial ?? b.ticketBatch?.batchRef ?? "—", b.ticketCount, b.actorId ? actorNames.get(b.actorId) ?? "Inactive staff" : "System"]), event);
    }
    case "ATTENDANCE_BY_GATE": {
      const checkIns = await prisma.checkIn.findMany({ where: { eventId: event.id, ...(Object.keys(range).length ? { checkedInAt: range } : {}) }, select: { gate: true, checkedInAt: true } });
      const groups = by(checkIns, (c) => `${hourLabel(c.checkedInAt, event.timezone)}\0${c.gate}`);
      return report(query.type, REPORT_TITLES[query.type], ["Local event time", "Gate", "Admissions"], [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => [...key.split("\0"), list.length]), event);
    }
    case "SCAN_ATTEMPTS": {
      const attempts = await prisma.scanAttempt.findMany({ where: { eventId: event.id, ...(Object.keys(range).length ? { attemptedAt: range } : {}) }, select: { method: true, resultCode: true } });
      const groups = by(attempts, (a) => `${a.method}\0${a.resultCode}`);
      return report(query.type, REPORT_TITLES[query.type], ["Method", "Outcome", "Attempts"], [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => [...key.split("\0"), list.length]), event);
    }
    case "SOLD_NOT_CHECKED_IN": {
      const allocations = await prisma.saleTicket.findMany({ where: { sale: { ...saleWhere, status: { notIn: ["CANCELLED", "REFUNDED"] } }, ticket: { status: "SOLD", checkIn: null } }, orderBy: { sale: { createdAt: "desc" } }, select: { ticket: { select: { serial: true, ticketType: { select: { name: true } } } }, sale: { select: { reference: true, seller: { select: { displayName: true } }, createdAt: true } } } });
      return report(query.type, REPORT_TITLES[query.type], ["Ticket serial", "Category", "Sale", "Seller", "Sale date"], allocations.map((a) => [a.ticket.serial, a.ticket.ticketType.name, a.sale.reference, a.sale.seller.displayName, a.sale.createdAt.toISOString()]), event);
    }
    case "RECONCILIATION": {
      const sales = await prisma.sale.findMany({ where: { ...saleWhere, status: { notIn: ["CANCELLED", "REFUNDED"] } }, select: { subtotalUgx: true, discountUgx: true, totalUgx: true, payments: { select: { amountUgx: true, method: true, adjustments: { select: { amountUgx: true, type: true } } } } } });
      const paymentRecords = sales.flatMap((s) => s.payments);
      const reversals = paymentRecords.flatMap((p) => p.adjustments).filter((a) => a.type === "REVERSAL").reduce((n, a) => n + a.amountUgx, 0);
      const refunds = paymentRecords.flatMap((p) => p.adjustments).filter((a) => a.type === "REFUND").reduce((n, a) => n + a.amountUgx, 0);
      const recorded = paymentRecords.reduce((n, p) => n + p.amountUgx, 0);
      const netPayments = recorded - reversals - refunds;
      const balance = sales.reduce((n, s) => n + s.totalUgx, 0) - netPayments;
      const cashNet = paymentRecords.filter((p) => p.method === "CASH").reduce((n, p) => n + p.amountUgx - p.adjustments.reduce((x, a) => x + a.amountUgx, 0), 0);
      return report(query.type, REPORT_TITLES[query.type], ["Measure", "Value"], [
        ["Gross sales value (UGX)", sales.reduce((n, s) => n + s.subtotalUgx, 0)], ["Discounts (UGX)", sales.reduce((n, s) => n + s.discountUgx, 0)],
        ["Net sales value (UGX)", sales.reduce((n, s) => n + s.totalUgx, 0)], ["Payments recorded by staff (UGX)", recorded],
        ["Payment reversals (UGX)", reversals], ["Refunds (UGX)", refunds], ["Net recorded payments (UGX)", netPayments],
        ["Outstanding balances (UGX)", balance], ["Expected cash after recorded adjustments (UGX)", cashNet], ["Actual cash counted (UGX)", "Not recorded"],
        ["Provider-verified payments", "No provider integration; staff-recorded only"],
      ], event);
    }
  }
}

export async function exportReport(ctx: AuthContext, query: ReportExportQuery): Promise<{ report: ReportData; csv: string }> {
  if (can(ctx.role, "report:export-full")) requirePermission(ctx.role, "report:export-full");
  else if (can(ctx.role, "report:export-own") && SELLER_REPORTS.has(query.type)) requirePermission(ctx.role, "report:export-own");
  else throw forbidden();
  const result = await getReport(ctx, query);
  await recordAudit({ actorId: ctx.userId, actorRole: ctx.role, action: "report.export", targetType: "report", targetId: query.type, eventId: result.eventId, summary: { reportType: query.type, format: query.format, rowCount: result.rows.length, from: query.from ?? null, to: query.to ?? null } });
  const csv = buildCsv(["Event", "Report", ...result.columns], result.rows.map((row) => [result.eventName, result.title, ...row]));
  return { report: result, csv };
}
