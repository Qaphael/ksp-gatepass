import { createHash, randomBytes } from "node:crypto";
import type { Prisma, SaleStatus } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/db/client";
import type {
  PaymentAdjustmentInput,
  PaymentCreateInput,
  SaleCreateInput,
  SaleListQuery,
} from "@/lib/validation/sales";
import { conflict, notFound, requirePermission } from "./errors";

const SALE_INCLUDE = {
  event: { select: { id: true, name: true, venue: true, organiserContact: true } },
  seller: { select: { id: true, displayName: true, username: true } },
  items: {
    include: {
      ticketType: { select: { id: true, name: true } },
      tickets: { include: { ticket: { select: { id: true, serial: true, status: true } } } },
    },
    orderBy: { id: "asc" },
  },
  payments: {
    include: {
      recordedBy: { select: { id: true, displayName: true } },
      adjustments: {
        include: { recordedBy: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { recordedAt: "asc" },
  },
} satisfies Prisma.SaleInclude;

type SaleRecord = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

export interface SaleDto {
  id: string;
  reference: string;
  eventId: string;
  eventName: string;
  venue: string;
  organiserContact: string | null;
  seller: { id: string; displayName: string; username: string };
  customerName: string | null;
  customerPhone: string | null;
  customerReference: string | null;
  notes: string | null;
  subtotalUgx: number;
  discountUgx: number;
  discountReason: string | null;
  totalUgx: number;
  amountPaidUgx: number;
  balanceUgx: number;
  status: SaleStatus;
  items: Array<{
    id: string;
    ticketTypeId: string;
    ticketTypeName: string;
    quantity: number;
    unitPriceUgx: number;
    discountUgx: number;
    lineTotalUgx: number;
    tickets: Array<{ id: string; serial: string; status: string }>;
  }>;
  payments: Array<{
    id: string;
    reference: string;
    amountUgx: number;
    netAmountUgx: number;
    method: string;
    externalRef: string | null;
    notes: string | null;
    status: string;
    recordedById: string;
    recordedByName: string;
    recordedAt: string;
    adjustments: Array<{
      id: string;
      type: string;
      amountUgx: number;
      reason: string;
      recordedById: string;
      recordedByName: string;
      createdAt: string;
    }>;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SaleListResult {
  sales: SaleDto[];
  total: number;
  page: number;
  pageSize: number;
}

function netPayment(payment: SaleRecord["payments"][number]): number {
  return payment.amountUgx - payment.adjustments.reduce((sum, row) => sum + row.amountUgx, 0);
}

function toDto(sale: SaleRecord): SaleDto {
  const amountPaidUgx = sale.payments.reduce((sum, payment) => sum + netPayment(payment), 0);
  return {
    id: sale.id,
    reference: sale.reference,
    eventId: sale.eventId,
    eventName: sale.event.name,
    venue: sale.event.venue,
    organiserContact: sale.event.organiserContact,
    seller: sale.seller,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    customerReference: sale.customerReference,
    notes: sale.notes,
    subtotalUgx: sale.subtotalUgx,
    discountUgx: sale.discountUgx,
    discountReason: sale.discountReason,
    totalUgx: sale.totalUgx,
    amountPaidUgx,
    balanceUgx: sale.totalUgx - amountPaidUgx,
    status: sale.status,
    items: sale.items.map((item) => ({
      id: item.id,
      ticketTypeId: item.ticketTypeId,
      ticketTypeName: item.ticketType.name,
      quantity: item.quantity,
      unitPriceUgx: item.unitPriceUgx,
      discountUgx: item.discountUgx,
      lineTotalUgx: item.lineTotalUgx,
      tickets: item.tickets.map(({ ticket }) => ({
        id: ticket.id,
        serial: ticket.serial,
        status: ticket.status,
      })),
    })),
    payments: sale.payments.map((payment) => ({
      id: payment.id,
      reference: payment.reference,
      amountUgx: payment.amountUgx,
      netAmountUgx: netPayment(payment),
      method: payment.method,
      externalRef: payment.externalRef,
      notes: payment.notes,
      status: payment.status,
      recordedById: payment.recordedById,
      recordedByName: payment.recordedBy.displayName,
      recordedAt: payment.recordedAt.toISOString(),
      adjustments: payment.adjustments.map((adjustment) => ({
        id: adjustment.id,
        type: adjustment.type,
        amountUgx: adjustment.amountUgx,
        reason: adjustment.reason,
        recordedById: adjustment.recordedById,
        recordedByName: adjustment.recordedBy.displayName,
        createdAt: adjustment.createdAt.toISOString(),
      })),
    })),
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
  };
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reference(prefix: "SALE" | "PAY"): string {
  return `${prefix}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function uniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

function checkKey(key: string | null): string | null {
  if (key === null) return null;
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > 128) throw conflict("Idempotency-Key must be between 1 and 128 characters.");
  return trimmed;
}

function auditInTransaction(
  tx: Prisma.TransactionClient,
  ctx: AuthContext,
  action: string,
  targetType: string,
  targetId: string,
  eventId: string,
  summary: Record<string, unknown>,
) {
  return tx.auditLog.create({
    data: {
      actorId: ctx.userId,
      actorRole: ctx.role,
      action,
      targetType,
      targetId,
      eventId,
      summary: summary as Prisma.InputJsonValue,
    },
  });
}

async function findSaleByKey(sellerId: string, key: string, requestHash?: string) {
  const sale = await prisma.sale.findUnique({
    where: { sellerId_idempotencyKey: { sellerId, idempotencyKey: key } },
    include: SALE_INCLUDE,
  });
  if (sale && requestHash && sale.requestHash !== requestHash) {
    throw conflict("This idempotency key was already used for a different sale request.");
  }
  return sale;
}

export async function createSale(
  ctx: AuthContext,
  input: SaleCreateInput,
  rawKey: string | null,
): Promise<{ sale: SaleDto; created: boolean }> {
  requirePermission(ctx.role, "sale:create");
  if (input.discountUgx) requirePermission(ctx.role, "sale:discount");
  const key = checkKey(rawKey);
  if (!key) throw conflict("Sale creation requires an Idempotency-Key.");
  const requestHash = hash(input);
  if (key) {
    const existing = await findSaleByKey(ctx.userId, key, requestHash);
    if (existing) return { sale: toDto(existing), created: false };
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        id: string; name: string; venue: string; organiserContact: string | null;
        salesOpen: boolean; status: string; salesOpensAt: Date | null; salesClosesAt: Date | null;
      }>>`SELECT id, name, venue, "organiserContact", "salesOpen", status, "salesOpensAt", "salesClosesAt" FROM "Event" WHERE id = ${input.eventId} FOR UPDATE`;
      const event = locked[0];
      if (!event) throw notFound("Event not found.");
      const now = new Date();
      if (!event.salesOpen || event.status === "COMPLETED" || event.status === "ARCHIVED") {
        throw conflict("Sales are not open for this event.");
      }
      if ((event.salesOpensAt && event.salesOpensAt > now) || (event.salesClosesAt && event.salesClosesAt <= now)) {
        throw conflict("This event is outside its sales window.");
      }

      const types = await tx.ticketType.findMany({
        where: { id: { in: input.items.map((item) => item.ticketTypeId) }, eventId: event.id },
      });
      if (types.length !== input.items.length) throw notFound("One or more ticket categories were not found for this event.");
      const byId = new Map(types.map((type) => [type.id, type]));
      let subtotalUgx = 0;
      const lines = input.items.map((item) => {
        const type = byId.get(item.ticketTypeId)!;
        if (type.status !== "ACTIVE") throw conflict(`Ticket category “${type.name}” is inactive.`);
        if ((type.salesOpensAt && type.salesOpensAt > now) || (type.salesClosesAt && type.salesClosesAt <= now)) {
          throw conflict(`Ticket category “${type.name}” is outside its sales window.`);
        }
        const lineTotalUgx = type.priceUgx * item.quantity;
        if (!Number.isSafeInteger(lineTotalUgx)) throw conflict("Sale total exceeds the supported amount.");
        subtotalUgx += lineTotalUgx;
        return { ...item, unitPriceUgx: type.priceUgx, lineTotalUgx, type };
      });
      if (!Number.isSafeInteger(subtotalUgx) || subtotalUgx > 2_000_000_000) throw conflict("Sale total exceeds the supported amount.");
      const discountUgx = input.discountUgx ?? 0;
      if (discountUgx > subtotalUgx) throw conflict("Discount cannot exceed the sale subtotal.");
      const totalUgx = subtotalUgx - discountUgx;
      if (input.initialPayment && input.initialPayment.amountUgx > totalUgx) {
        throw conflict("Initial payment cannot exceed the sale total.");
      }

      const sale = await tx.sale.create({
        data: {
          reference: reference("SALE"),
          eventId: event.id,
          sellerId: ctx.userId,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          customerReference: input.customerReference ?? null,
          notes: input.notes ?? null,
          subtotalUgx,
          discountUgx,
          discountReason: input.discountReason ?? null,
          discountedById: discountUgx > 0 ? ctx.userId : null,
          totalUgx,
          status: "PENDING_PAYMENT",
          idempotencyKey: key,
          requestHash,
        },
      });

      for (const line of lines) {
        const tickets = await tx.ticket.findMany({
          where: { eventId: event.id, ticketTypeId: line.ticketTypeId, status: "AVAILABLE" },
          orderBy: [{ createdAt: "asc" }, { serial: "asc" }],
          take: line.quantity,
          select: { id: true },
        });
        if (tickets.length !== line.quantity) {
          throw conflict(`Only ${tickets.length} tickets are currently available in “${line.type.name}”.`);
        }
        const item = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            ticketTypeId: line.ticketTypeId,
            quantity: line.quantity,
            unitPriceUgx: line.unitPriceUgx,
            discountUgx: 0,
            lineTotalUgx: line.lineTotalUgx,
          },
        });
        const updated = await tx.ticket.updateMany({
          where: { id: { in: tickets.map((ticket) => ticket.id) }, status: "AVAILABLE" },
          data: { status: "SOLD" },
        });
        if (updated.count !== tickets.length) throw conflict("Ticket inventory changed. Please retry the sale.");
        await tx.saleTicket.createMany({
          data: tickets.map((ticket) => ({ saleId: sale.id, saleItemId: item.id, ticketId: ticket.id })),
        });
      }

      if (input.initialPayment) {
        await tx.payment.create({
          data: {
            reference: reference("PAY"),
            saleId: sale.id,
            amountUgx: input.initialPayment.amountUgx,
            method: input.initialPayment.method,
            externalRef: input.initialPayment.externalRef ?? null,
            notes: input.initialPayment.notes ?? null,
            recordedById: ctx.userId,
          },
        });
      }
      const status: SaleStatus = input.initialPayment
        ? input.initialPayment.amountUgx === totalUgx ? "PAID" : "PARTIALLY_PAID"
        : "PENDING_PAYMENT";
      await tx.sale.update({ where: { id: sale.id }, data: { status } });
      await auditInTransaction(tx, ctx, "sale.create", "sale", sale.id, event.id, {
        reference: sale.reference, totalUgx, ticketCount: input.items.reduce((sum, item) => sum + item.quantity, 0),
        initialPaymentUgx: input.initialPayment?.amountUgx ?? 0,
        discountUgx,
        ...(discountUgx > 0 ? { discountReason: input.discountReason } : {}),
      });
      if (input.initialPayment) {
        await auditInTransaction(tx, ctx, "payment.record", "sale", sale.id, event.id, {
          amountUgx: input.initialPayment.amountUgx, method: input.initialPayment.method,
          externallyConfirmed: false,
        });
      }
      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: SALE_INCLUDE });
    }, { maxWait: 10_000, timeout: 30_000 });
    return { sale: toDto(sale), created: true };
  } catch (error) {
    if (uniqueViolation(error) && key) {
      const existing = await findSaleByKey(ctx.userId, key, requestHash);
      if (existing) return { sale: toDto(existing), created: false };
    }
    throw error;
  }
}

export async function listSales(ctx: AuthContext, query: SaleListQuery): Promise<SaleListResult> {
  const permission: Permission = can(ctx.role, "sale:read-all") ? "sale:read-all" : "sale:read-own";
  requirePermission(ctx.role, permission);
  const where = {
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(permission === "sale:read-own" ? { sellerId: ctx.userId } : {}),
  };
  const [total, sales] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where, include: SALE_INCLUDE, orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    }),
  ]);
  return { sales: sales.map(toDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getSale(ctx: AuthContext, id: string): Promise<SaleDto> {
  const permission: Permission = can(ctx.role, "sale:read-all") ? "sale:read-all" : "sale:read-own";
  requirePermission(ctx.role, permission);
  const sale = await prisma.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
  if (!sale || (permission === "sale:read-own" && sale.sellerId !== ctx.userId)) throw notFound("Sale not found.");
  return toDto(sale);
}

async function getVisibleSale(ctx: AuthContext, tx: Prisma.TransactionClient, id: string) {
  const sale = await tx.sale.findUnique({ where: { id } });
  if (!sale) throw notFound("Sale not found.");
  if (!can(ctx.role, "sale:read-all") && sale.sellerId !== ctx.userId) throw notFound("Sale not found.");
  return sale;
}

async function amountPaid(tx: Prisma.TransactionClient, saleId: string): Promise<number> {
  const rows = await tx.payment.findMany({ where: { saleId }, include: { adjustments: true } });
  return rows.reduce((sum, payment) => sum + payment.amountUgx - payment.adjustments.reduce((a, adj) => a + adj.amountUgx, 0), 0);
}

async function refreshSaleStatus(tx: Prisma.TransactionClient, saleId: string): Promise<SaleStatus> {
  const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
  const paid = await amountPaid(tx, saleId);
  const status: SaleStatus = paid === 0 ? "PENDING_PAYMENT" : paid >= sale.totalUgx ? "PAID" : "PARTIALLY_PAID";
  await tx.sale.update({ where: { id: saleId }, data: { status } });
  return status;
}

export async function recordPayment(
  ctx: AuthContext, saleId: string, input: PaymentCreateInput, rawKey: string | null,
): Promise<{ sale: SaleDto; created: boolean }> {
  requirePermission(ctx.role, "payment:record");
  const key = checkKey(rawKey);
  if (!key) throw conflict("Payment recording requires an Idempotency-Key.");
  const requestHash = hash({ saleId, ...input });
  if (key) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key }, include: { sale: true } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw conflict("This idempotency key was already used for a different payment request.");
      return { sale: await getSale(ctx, existing.saleId), created: false };
    }
  }
  let created: boolean;
  try {
    created = await prisma.$transaction(async (tx) => {
      const sale = await getVisibleSale(ctx, tx, saleId);
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${sale.id} FOR UPDATE`;
      const retry = await tx.payment.findUnique({ where: { idempotencyKey: key } });
      if (retry) {
        if (retry.requestHash !== requestHash) throw conflict("This idempotency key was already used for a different payment request.");
        return false;
      }
      const current = await tx.sale.findUniqueOrThrow({ where: { id: sale.id } });
      if (["CANCELLED", "REFUNDED"].includes(current.status)) throw conflict("Payments cannot be recorded on a cancelled or refunded sale.");
      const paid = await amountPaid(tx, sale.id);
      const balance = current.totalUgx - paid;
      if (input.amountUgx > balance) throw conflict(`Payment exceeds the outstanding balance of UGX ${balance}.`);
      await tx.payment.create({
        data: {
          reference: reference("PAY"), saleId: sale.id, amountUgx: input.amountUgx,
          method: input.method, externalRef: input.externalRef ?? null, notes: input.notes ?? null,
          recordedById: ctx.userId, idempotencyKey: key, requestHash,
        },
      });
      await refreshSaleStatus(tx, sale.id);
      await auditInTransaction(tx, ctx, "payment.record", "sale", sale.id, sale.eventId, {
        amountUgx: input.amountUgx, method: input.method, externallyConfirmed: false,
      });
      return true;
    }, { maxWait: 10_000, timeout: 15_000 });
  } catch (error) {
    if (uniqueViolation(error) && key) {
      const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw conflict("This idempotency key was already used for a different payment request.");
        return { sale: await getSale(ctx, existing.saleId), created: false };
      }
    }
    throw error;
  }
  return { sale: await getSale(ctx, saleId), created };
}

export async function adjustPayment(
  ctx: AuthContext,
  paymentId: string,
  type: "REVERSAL" | "REFUND",
  input: PaymentAdjustmentInput,
  rawKey: string | null,
): Promise<{ sale: SaleDto; created: boolean }> {
  const permission = type === "REVERSAL" ? "payment:reverse" : "sale:refund";
  requirePermission(ctx.role, permission);
  const key = checkKey(rawKey);
  if (!key) throw conflict("Payment adjustments require an Idempotency-Key.");
  const requestHash = hash({ paymentId, type, input });
  if (key) {
    const existing = await prisma.paymentAdjustment.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw conflict("This idempotency key was already used for a different adjustment request.");
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: existing.paymentId } });
      return { sale: await getSale(ctx, payment.saleId), created: false };
    }
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw notFound("Payment not found.");
      const sale = await getVisibleSale(ctx, tx, payment.saleId);
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${sale.id} FOR UPDATE`;
      const retry = await tx.paymentAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (retry) {
        if (retry.requestHash !== requestHash) throw conflict("This idempotency key was already used for a different adjustment request.");
        return { saleId: sale.id, created: false };
      }
      const currentSale = await tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { event: true } });
      if (["CANCELLED", "REFUNDED"].includes(currentSale.status)) throw conflict("This sale is already closed.");
      if (type === "REFUND" && currentSale.event.admissionStartedAt) {
        throw conflict("Refunds are blocked after event admission has opened.");
      }
      const paymentState = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { adjustments: true } });
      const remaining = paymentState.amountUgx - paymentState.adjustments.reduce((sum, adj) => sum + adj.amountUgx, 0);
      const amountUgx = input.amountUgx ?? remaining;
      if (amountUgx <= 0 || amountUgx > remaining) throw conflict(`Adjustment exceeds the unadjusted payment balance of UGX ${remaining}.`);
      await tx.paymentAdjustment.create({
        data: {
          paymentId, type, amountUgx, reason: input.reason, recordedById: ctx.userId,
          idempotencyKey: key, requestHash,
        },
      });
      if (amountUgx === remaining) {
        await tx.payment.update({ where: { id: paymentId }, data: { status: type === "REFUND" ? "REFUNDED" : "REVERSED" } });
      }
      await refreshSaleStatus(tx, sale.id);
      await auditInTransaction(tx, ctx, type === "REFUND" ? "payment.refund" : "payment.reverse", "payment", paymentId, sale.eventId, {
        amountUgx, reason: input.reason,
      });
      return { saleId: sale.id, created: true };
    }, { maxWait: 10_000, timeout: 15_000 });
    return { sale: await getSale(ctx, result.saleId), created: result.created };
  } catch (error) {
    if (uniqueViolation(error) && key) {
      const existing = await prisma.paymentAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw conflict("This idempotency key was already used for a different adjustment request.");
        const payment = await prisma.payment.findUniqueOrThrow({ where: { id: existing.paymentId } });
        return { sale: await getSale(ctx, payment.saleId), created: false };
      }
    }
    throw error;
  }
}

export async function cancelSale(ctx: AuthContext, saleId: string, reason: string): Promise<SaleDto> {
  requirePermission(ctx.role, "sale:cancel");
  const sale = await prisma.$transaction(async (tx) => {
    const current = await tx.sale.findUnique({ where: { id: saleId }, include: { event: true, payments: { include: { adjustments: true } } } });
    if (!current) throw notFound("Sale not found.");
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    if (["CANCELLED", "REFUNDED"].includes(current.status)) throw conflict("This sale is already closed.");
    if (current.event.admissionStartedAt) throw conflict("Cancellation is blocked after event admission has opened.");
    const paid = current.payments.reduce((sum, payment) => sum + payment.amountUgx - payment.adjustments.reduce((a, adj) => a + adj.amountUgx, 0), 0);
    if (paid > 0) throw conflict("This sale has recorded payments. Refund or reverse them before cancellation.");
    await tx.sale.update({ where: { id: saleId }, data: { status: "CANCELLED" } });
    await tx.ticket.updateMany({ where: { saleTickets: { some: { saleId } }, status: "SOLD" }, data: { status: "CANCELLED" } });
    await auditInTransaction(tx, ctx, "sale.cancel", "sale", saleId, current.eventId, { reference: current.reference, reason });
    return saleId;
  });
  return getSale(ctx, sale);
}

export async function refundSale(ctx: AuthContext, saleId: string, reason: string, rawKey: string | null): Promise<{ sale: SaleDto; created: boolean }> {
  requirePermission(ctx.role, "sale:refund");
  const key = checkKey(rawKey);
  if (!key) throw conflict("Refund requires an Idempotency-Key.");
  const requestHash = hash({ saleId, reason });
  const idempotencyHash = hash({ key, requestHash });
  const prior = await prisma.auditLog.findFirst({ where: { action: "sale.refund", targetId: saleId, summary: { path: ["idempotencyHash"], equals: idempotencyHash } } });
  if (prior) return { sale: await getSale(ctx, saleId), created: false };
  const created = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { event: true, payments: { include: { adjustments: true } } } });
    if (!sale) throw notFound("Sale not found.");
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const current = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { event: true, payments: { include: { adjustments: true } } } });
    if (current.status === "REFUNDED") {
      const retry = await tx.auditLog.findFirst({ where: { action: "sale.refund", targetId: saleId, summary: { path: ["idempotencyHash"], equals: idempotencyHash } } });
      if (retry) return false;
      throw conflict("This sale is already closed.");
    }
    if (current.status === "CANCELLED") throw conflict("This sale is already closed.");
    if (current.event.admissionStartedAt) throw conflict("Refunds are blocked after event admission has opened.");
    const net = current.payments.reduce((sum, payment) => sum + payment.amountUgx - payment.adjustments.reduce((a, adj) => a + adj.amountUgx, 0), 0);
    if (net <= 0) throw conflict("There is no recorded payment to refund. Cancel this unpaid sale instead.");
    for (const payment of current.payments) {
      const remaining = payment.amountUgx - payment.adjustments.reduce((sum, adj) => sum + adj.amountUgx, 0);
      if (remaining <= 0) continue;
      await tx.paymentAdjustment.create({
        data: {
          paymentId: payment.id, type: "REFUND", amountUgx: remaining, reason,
          recordedById: ctx.userId, idempotencyKey: `REFUND-${hash({ key, paymentId: payment.id })}`,
          requestHash: hash({ requestHash, paymentId: payment.id }),
        },
      });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
    }
    await tx.sale.update({ where: { id: saleId }, data: { status: "REFUNDED" } });
    await tx.ticket.updateMany({ where: { saleTickets: { some: { saleId } }, status: "SOLD" }, data: { status: "CANCELLED" } });
    await auditInTransaction(tx, ctx, "sale.refund", "sale", saleId, current.eventId, {
      reference: current.reference, amountUgx: net, reason, idempotencyHash,
    });
    return true;
  }, { maxWait: 10_000, timeout: 20_000 });
  return { sale: await getSale(ctx, saleId), created };
}

/** Receipt printing and transaction history use this safe, role-scoped DTO. */
export async function getSaleForReceipt(ctx: AuthContext, id: string): Promise<SaleDto> {
  return getSale(ctx, id);
}
