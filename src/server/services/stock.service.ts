import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PaymentMethod, type StockOperationKind } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/db/client";
import { hashQrToken } from "@/lib/qr/tokens";
import { sanitizeAuditData } from "@/lib/audit";
import type { RemittanceCreateInput, RemittanceReverseInput, StockCloseoutInput, StockIssueInput, StockLossInput, StockReturnInput, StockStatementQuery } from "@/lib/validation/stock";
import { conflict, forbidden, notFound, requirePermission } from "./errors";

type Tx = Prisma.TransactionClient;
type StockActor = Pick<AuthContext, "userId" | "role" | "displayName">;
type TicketRow = { id: string; serial: string; eventId: string; ticketTypeId: string; status: string };

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function idempotencyKey(raw: string | null): string {
  const value = raw?.trim();
  if (!value || value.length > 128) throw conflict("This operation requires an Idempotency-Key of 1 to 128 characters.");
  return value;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

function reference(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

async function audit(tx: Tx, ctx: StockActor, action: string, eventId: string, targetType: string, targetId: string, summary: Record<string, unknown>) {
  await tx.auditLog.create({ data: { actorId: ctx.userId, actorRole: ctx.role, action, eventId, targetType, targetId, summary: sanitizeAuditData(summary) as Prisma.InputJsonValue } });
}

async function requireEvent(tx: Tx, eventId: string) {
  const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, requireStockIssue: true } });
  if (!event) throw notFound("Event not found.");
  return event;
}

async function requireSeller(tx: Tx, sellerId: string) {
  const seller = await tx.user.findUnique({ where: { id: sellerId }, select: { id: true, displayName: true, role: true, active: true } });
  if (!seller || seller.role !== "SELLER" || !seller.active) throw notFound("Active seller not found.");
  return seller;
}

async function lockSeller(tx: Tx, sellerId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${sellerId} FOR UPDATE`;
}

async function lockTickets(tx: Tx, ids: string[]): Promise<void> {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length) await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" IN (${Prisma.join(sorted)}) ORDER BY "id" FOR UPDATE`;
}

async function assertNoActiveCustody(tx: Tx, ticketIds: string[]) {
  if (!ticketIds.length) return;
  const active = await tx.ticketCustody.findMany({ where: { ticketId: { in: ticketIds }, releasedAt: null }, select: { ticketId: true } });
  if (active.length) throw conflict("One or more tickets are already issued to a seller.");
}

async function getIssueRetry(actorId: string, key: string, requestHash: string) {
  const issue = await prisma.stockIssue.findUnique({ where: { issuedById_idempotencyKey: { issuedById: actorId, idempotencyKey: key } }, include: { seller: { select: { id: true, displayName: true } }, issuedBy: { select: { id: true, displayName: true } }, tickets: { include: { ticket: { select: { serial: true } } }, orderBy: { ticket: { serial: "asc" } } } } });
  if (issue && issue.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different stock issue.");
  return issue;
}

function issueResult(issue: NonNullable<Awaited<ReturnType<typeof getIssueRetry>>>) {
  return {
    issue: {
      id: issue.id,
      slipReference: issue.slipReference,
      eventId: issue.eventId,
      seller: issue.seller,
      issuer: issue.issuedBy,
      issuedAt: issue.issuedAt.toISOString(),
      quantity: issue.tickets.length,
      serials: issue.tickets.map((row) => row.ticket.serial),
    },
  };
}

export async function issueStock(ctx: AuthContext, input: StockIssueInput, rawKey: string | null) {
  requirePermission(ctx.role, "stock:manage");
  const key = idempotencyKey(rawKey);
  const requestHash = digest(input);
  const prior = await getIssueRetry(ctx.userId, key, requestHash);
  if (prior) return { ...issueResult(prior), created: false };

  try {
    const issueId = await prisma.$transaction(async (tx) => {
      const retry = await tx.stockIssue.findUnique({ where: { issuedById_idempotencyKey: { issuedById: ctx.userId, idempotencyKey: key } }, select: { id: true, requestHash: true } });
      if (retry) {
        if (retry.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different stock issue.");
        return retry.id;
      }
      await requireEvent(tx, input.eventId);
      const seller = await requireSeller(tx, input.sellerId);
      await lockSeller(tx, seller.id);
      if (await tx.stockCloseout.findUnique({ where: { eventId_sellerId: { eventId: input.eventId, sellerId: seller.id } }, select: { id: true } })) {
        throw conflict("This seller has already been closed out for the event.");
      }

      let tickets: TicketRow[];
      if (input.selection.kind === "TOKENS") {
        const hashes = input.selection.tokens.map(hashQrToken);
        tickets = await tx.ticket.findMany({ where: { eventId: input.eventId, tokenHash: { in: hashes } }, select: { id: true, serial: true, eventId: true, ticketTypeId: true, status: true }, orderBy: { serial: "asc" } });
        if (tickets.length !== hashes.length) throw notFound("One or more scanned tickets were not found for this event.");
        await lockTickets(tx, tickets.map(ticket => ticket.id));
        tickets = await tx.ticket.findMany({ where: { id: { in: tickets.map(ticket => ticket.id) } }, select: { id: true, serial: true, eventId: true, ticketTypeId: true, status: true }, orderBy: { serial: "asc" } });
      } else if (input.selection.kind === "CATEGORY_QUANTITY") {
        const category = await tx.ticketType.findFirst({ where: { id: input.selection.ticketTypeId, eventId: input.eventId }, select: { id: true } });
        if (!category) throw notFound("Ticket category not found for this event.");
        tickets = await tx.$queryRaw<TicketRow[]>`
          SELECT t."id", t."serial", t."eventId", t."ticketTypeId", t."status"::text AS "status"
          FROM "Ticket" t
          WHERE t."eventId" = ${input.eventId} AND t."ticketTypeId" = ${category.id}
            AND t."status" = 'AVAILABLE'::"TicketStatus"
            AND NOT EXISTS (SELECT 1 FROM "TicketCustody" c WHERE c."ticketId" = t."id" AND c."releasedAt" IS NULL)
          ORDER BY t."serial" ASC LIMIT ${input.selection.quantity} FOR UPDATE OF t SKIP LOCKED`;
        if (tickets.length !== input.selection.quantity) throw conflict(`Only ${tickets.length} unissued tickets are available in this category.`);
      } else if (input.selection.kind === "SERIALS") {
        tickets = await tx.ticket.findMany({ where: { eventId: input.eventId, serial: { in: input.selection.serials } }, select: { id: true, serial: true, eventId: true, ticketTypeId: true, status: true }, orderBy: { serial: "asc" } });
        if (tickets.length !== input.selection.serials.length) throw notFound("One or more ticket serials were not found for this event.");
        await lockTickets(tx, tickets.map((ticket) => ticket.id));
        tickets = await tx.ticket.findMany({ where: { id: { in: tickets.map((ticket) => ticket.id) } }, select: { id: true, serial: true, eventId: true, ticketTypeId: true, status: true }, orderBy: { serial: "asc" } });
      } else {
        tickets = await tx.ticket.findMany({ where: { eventId: input.eventId, serial: { gte: input.selection.serialFrom, lte: input.selection.serialTo } }, select: { id: true, serial: true, eventId: true, ticketTypeId: true, status: true }, orderBy: { serial: "asc" }, take: 501 });
        if (!tickets.length) throw notFound("No tickets were found in that serial range for this event.");
        if (tickets.length > 500) throw conflict("Issue no more than 500 tickets at a time.");
        await lockTickets(tx, tickets.map((ticket) => ticket.id));
        tickets = await tx.ticket.findMany({ where: { id: { in: tickets.map((ticket) => ticket.id) } }, select: { id: true, serial: true, eventId: true, ticketTypeId: true, status: true }, orderBy: { serial: "asc" } });
      }
      if (tickets.some((ticket) => ticket.status !== "AVAILABLE")) throw conflict("Only AVAILABLE tickets can be issued.");
      await assertNoActiveCustody(tx, tickets.map((ticket) => ticket.id));

      const issue = await tx.stockIssue.create({ data: {
        slipReference: reference("ISSUE"), eventId: input.eventId, sellerId: seller.id, issuedById: ctx.userId,
        idempotencyKey: key, requestHash,
      } });
      await tx.ticketCustody.createMany({ data: tickets.map((ticket) => ({ ticketId: ticket.id, stockIssueId: issue.id, sellerId: seller.id, issuedById: ctx.userId })) });
      await audit(tx, ctx, "stock.issue", input.eventId, "stock-issue", issue.id, { slipReference: issue.slipReference, sellerId: seller.id, quantity: tickets.length, serials: tickets.map((ticket) => ticket.serial) });
      return issue.id;
    }, { maxWait: 10_000, timeout: 30_000 });
    const created = await getIssueRetry(ctx.userId, key, requestHash);
    if (!created || created.id !== issueId) throw conflict("Stock issue was committed but could not be retrieved.");
    return { ...issueResult(created), created: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const retry = await getIssueRetry(ctx.userId, key, requestHash);
      if (retry) return { ...issueResult(retry), created: false };
      throw conflict("One or more tickets were issued by another request. Refresh stock and try again.");
    }
    throw error;
  }
}

export async function getStockIssueSlip(ctx: AuthContext, issueId: string) {
  requirePermission(ctx.role, "stock:read-all");
  const issue = await prisma.stockIssue.findUnique({ where: { id: issueId }, include: { event: { select: { name: true } }, seller: { select: { displayName: true, username: true } }, issuedBy: { select: { displayName: true } }, tickets: { include: { ticket: { select: { serial: true, ticketType: { select: { name: true } } } } }, orderBy: { ticket: { serial: "asc" } } } } });
  if (!issue) throw notFound("Stock issue not found.");
  await prisma.auditLog.create({ data: { actorId: ctx.userId, actorRole: ctx.role, eventId: issue.eventId, action: "stock.issue-slip.print", targetType: "stock-issue", targetId: issue.id, summary: { slipReference: issue.slipReference, ticketCount: issue.tickets.length } } });
  return { reference: issue.slipReference, eventName: issue.event.name, sellerName: issue.seller.displayName, sellerUsername: issue.seller.username, issuerName: issue.issuedBy.displayName, issuedAt: issue.issuedAt, rows: issue.tickets.map(row => ({ serial: row.ticket.serial, category: row.ticket.ticketType.name })) };
}

async function findOperation(ctx: StockActor, operation: StockOperationKind, key: string, requestHash: string) {
  const prior = await prisma.stockOperation.findUnique({ where: { actorId_operation_idempotencyKey: { actorId: ctx.userId, operation, idempotencyKey: key } } });
  if (!prior) return null;
  if (prior.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different stock operation.");
  return prior.result as Record<string, unknown>;
}

async function performRelease(ctx: AuthContext, operation: StockOperationKind, input: StockReturnInput | StockLossInput, rawKey: string | null) {
  requirePermission(ctx.role, "stock:manage");
  const key = idempotencyKey(rawKey);
  const requestHash = digest(input);
  const prior = await findOperation(ctx, operation, key, requestHash);
  if (prior) return { ...prior, created: false };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const retry = await tx.stockOperation.findUnique({ where: { actorId_operation_idempotencyKey: { actorId: ctx.userId, operation, idempotencyKey: key } } });
      if (retry) {
        if (retry.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different stock operation.");
        return retry.result as Record<string, unknown>;
      }
      await requireEvent(tx, input.eventId);
      await requireSeller(tx, input.sellerId);
      await lockSeller(tx, input.sellerId);
      const tickets = await tx.ticket.findMany({ where: { eventId: input.eventId, serial: { in: input.serials } }, select: { id: true, serial: true, eventId: true, ticketTypeId: true, status: true }, orderBy: { id: "asc" } });
      if (tickets.length !== input.serials.length) throw notFound("One or more ticket serials were not found for this event.");
      await lockTickets(tx, tickets.map((ticket) => ticket.id));
      const active = await tx.ticketCustody.findMany({ where: { ticketId: { in: tickets.map((ticket) => ticket.id) }, sellerId: input.sellerId, releasedAt: null }, select: { id: true, ticketId: true } });
      if (active.length !== tickets.length) throw conflict("Every ticket must still be held by this seller.");
      if (tickets.some((ticket) => ticket.status !== "AVAILABLE")) throw conflict(operation === "RETURN" ? "Only unsold AVAILABLE tickets can be returned." : "Only unsold AVAILABLE tickets can be marked lost.");
      const now = new Date();
      if (operation === "LOSS") {
        const loss = input as StockLossInput;
        const updated = await tx.ticket.updateMany({ where: { id: { in: tickets.map((ticket) => ticket.id) }, status: "AVAILABLE" }, data: { status: "REVOKED", revokeReason: loss.reason, revokedById: ctx.userId } });
        if (updated.count !== tickets.length) throw conflict("Ticket inventory changed. Refresh stock and retry.");
      }
      const reason = operation === "RETURN" ? "RETURNED" : "LOST";
      const released = await tx.ticketCustody.updateMany({ where: { id: { in: active.map((row) => row.id) }, releasedAt: null }, data: { releasedAt: now, releaseReason: reason, releasedById: ctx.userId, releaseNote: operation === "RETURN" ? (input as StockReturnInput).note ?? null : (input as StockLossInput).reason } });
      if (released.count !== tickets.length) throw conflict("Stock custody changed. Refresh stock and retry.");
      const safeResult = { operation, eventId: input.eventId, sellerId: input.sellerId, releasedAt: now.toISOString(), serials: tickets.map((ticket) => ticket.serial), count: tickets.length };
      const stockOperation = await tx.stockOperation.create({ data: { eventId: input.eventId, actorId: ctx.userId, operation, idempotencyKey: key, requestHash, result: safeResult as Prisma.InputJsonValue } });
      await audit(tx, ctx, operation === "RETURN" ? "stock.return" : "stock.loss", input.eventId, "stock-operation", stockOperation.id, {
        sellerId: input.sellerId, serials: safeResult.serials, count: tickets.length,
        ...(operation === "LOSS" ? { reason: (input as StockLossInput).reason } : { note: (input as StockReturnInput).note ?? null }),
      });
      if (operation === "LOSS") {
        for (const ticket of tickets) await audit(tx, ctx, "ticket.revoke", input.eventId, "ticket", ticket.id, { serial: ticket.serial, reason: (input as StockLossInput).reason, previousStatus: "AVAILABLE", stockLoss: true });
      }
      return safeResult;
    }, { maxWait: 10_000, timeout: 30_000 });
    return { ...result, created: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const retry = await findOperation(ctx, operation, key, requestHash);
      if (retry) return { ...retry, created: false };
      throw conflict("Stock changed in another request. Refresh and try again.");
    }
    throw error;
  }
}

export function returnStock(ctx: AuthContext, input: StockReturnInput, key: string | null) {
  return performRelease(ctx, "RETURN", input, key);
}

export function markStockLost(ctx: AuthContext, input: StockLossInput, key: string | null) {
  return performRelease(ctx, "LOSS", input, key);
}

export async function getSellerStockStatement(ctx: AuthContext, sellerId: string, query: StockStatementQuery) {
  const permission: Permission = can(ctx.role, "stock:read-all") ? "stock:read-all" : "stock:read-own";
  requirePermission(ctx.role, permission);
  if (permission === "stock:read-own" && sellerId !== ctx.userId) throw forbidden();
  const [event, seller, custodyRows, sales, remittances, closeout] = await Promise.all([
    prisma.event.findUnique({ where: { id: query.eventId }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: sellerId }, select: { id: true, displayName: true, username: true, role: true } }),
    prisma.ticketCustody.findMany({ where: { sellerId, stockIssue: { eventId: query.eventId } }, include: { ticket: { select: { serial: true } } }, orderBy: { issuedAt: "asc" } }),
    prisma.sale.findMany({ where: { eventId: query.eventId, sellerId }, select: { payments: { select: { amountUgx: true, method: true, adjustments: { select: { amountUgx: true } } } } } }),
    prisma.remittance.findMany({ where: { eventId: query.eventId, sellerId }, select: { amountUgx: true, method: true, reversesId: true } }),
    prisma.stockCloseout.findUnique({ where: { eventId_sellerId: { eventId: query.eventId, sellerId } }, select: { closedAt: true } }),
  ]);
  if (!event) throw notFound("Event not found.");
  if (!seller || seller.role !== "SELLER") throw notFound("Seller not found.");
  const issued = custodyRows.length;
  const sold = custodyRows.filter((row) => row.releaseReason === "SOLD").length;
  const returned = custodyRows.filter((row) => row.releaseReason === "RETURNED").length;
  const lost = custodyRows.filter((row) => row.releaseReason === "LOST").length;
  const outstandingSerials = custodyRows.filter((row) => row.releasedAt === null).map((row) => row.ticket.serial);
  const takingsByMethod: Record<PaymentMethod, number> = { CASH: 0, MOBILE_MONEY: 0, BANK_TRANSFER: 0, CARD: 0, OTHER: 0 };
  for (const sale of sales) for (const payment of sale.payments) {
    takingsByMethod[payment.method] += payment.amountUgx - payment.adjustments.reduce((sum, adjustment) => sum + adjustment.amountUgx, 0);
  }
  const totalTakingsUgx = Object.values(takingsByMethod).reduce((sum, value) => sum + value, 0);
  const remittedUgx = remittances.reduce((sum, row) => sum + (row.reversesId ? -row.amountUgx : row.amountUgx), 0);
  return {
    event: { id: event.id, name: event.name },
    seller: { id: seller.id, displayName: seller.displayName, username: seller.username },
    stock: { issued, sold, returned, lost, outstanding: outstandingSerials.length, outstandingSerials },
    takingsByMethodUgx: takingsByMethod,
    totalTakingsUgx,
    remittedUgx,
    balanceOwedUgx: totalTakingsUgx - remittedUgx,
    closedAt: closeout?.closedAt.toISOString() ?? null,
  };
}

export async function closeOutSeller(ctx: AuthContext, sellerId: string, input: StockCloseoutInput, rawKey: string | null) {
  requirePermission(ctx.role, "stock:manage");
  const key = idempotencyKey(rawKey);
  const requestHash = digest({ sellerId, ...input });
  const prior = await prisma.stockCloseout.findUnique({ where: { closedById_idempotencyKey: { closedById: ctx.userId, idempotencyKey: key } } });
  if (prior) {
    if (prior.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different seller close-out.");
    return { closeout: { id: prior.id, sellerId: prior.sellerId, eventId: prior.eventId, closedAt: prior.closedAt.toISOString(), outstandingCount: prior.outstandingCount }, created: false };
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const retry = await tx.stockCloseout.findUnique({ where: { closedById_idempotencyKey: { closedById: ctx.userId, idempotencyKey: key } } });
      if (retry) {
        if (retry.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different seller close-out.");
        return { row: retry, created: false };
      }
      await requireEvent(tx, input.eventId);
      await requireSeller(tx, sellerId);
      await lockSeller(tx, sellerId);
      const existing = await tx.stockCloseout.findUnique({ where: { eventId_sellerId: { eventId: input.eventId, sellerId } } });
      if (existing) throw conflict("This seller is already closed out for the event.");
      const activeBefore = await tx.ticketCustody.findMany({ where: { sellerId, releasedAt: null, stockIssue: { eventId: input.eventId } }, select: { ticketId: true } });
      await lockTickets(tx, activeBefore.map((row) => row.ticketId));
      const active = await tx.ticketCustody.findMany({ where: { sellerId, releasedAt: null, stockIssue: { eventId: input.eventId } }, include: { ticket: { select: { serial: true } } }, orderBy: { ticket: { serial: "asc" } } });
      if (active.length) {
        const sample = active.slice(0, 20).map((row) => row.ticket.serial).join(", ");
        throw conflict(`Close-out blocked: ${active.length} ticket(s) are still unaccounted for${sample ? ` (${sample}${active.length > 20 ? ", …" : ""})` : ""}.`);
      }
      const row = await tx.stockCloseout.create({ data: { eventId: input.eventId, sellerId, closedById: ctx.userId, idempotencyKey: key, requestHash, outstandingCount: 0 } });
      await audit(tx, ctx, "stock.closeout", input.eventId, "seller", sellerId, { closeoutId: row.id, outstandingCount: row.outstandingCount });
      return { row, created: true };
    }, { maxWait: 10_000, timeout: 30_000 });
    return { closeout: { id: result.row.id, sellerId, eventId: input.eventId, closedAt: result.row.closedAt.toISOString(), outstandingCount: result.row.outstandingCount }, created: result.created };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const retry = await prisma.stockCloseout.findUnique({ where: { closedById_idempotencyKey: { closedById: ctx.userId, idempotencyKey: key } } });
      if (retry) {
        if (retry.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different seller close-out.");
        return { closeout: { id: retry.id, sellerId: retry.sellerId, eventId: retry.eventId, closedAt: retry.closedAt.toISOString(), outstandingCount: retry.outstandingCount }, created: false };
      }
      throw conflict("This seller is already closed out for the event.");
    }
    throw error;
  }
}

async function getRemittanceRetry(actorId: string, key: string, requestHash: string) {
  const row = await prisma.remittance.findUnique({ where: { recordedById_idempotencyKey: { recordedById: actorId, idempotencyKey: key } } });
  if (row && row.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different remittance.");
  return row;
}

function remittanceDto(row: NonNullable<Awaited<ReturnType<typeof getRemittanceRetry>>>) {
  return {
    id: row.id,
    eventId: row.eventId,
    sellerId: row.sellerId,
    amountUgx: row.amountUgx,
    method: row.method,
    receivedById: row.receivedById,
    recordedById: row.recordedById,
    note: row.note,
    reversesId: row.reversesId,
    recordedAt: row.recordedAt.toISOString(),
  };
}

export async function recordRemittance(ctx: AuthContext, input: RemittanceCreateInput, rawKey: string | null) {
  requirePermission(ctx.role, "remittance:record");
  const key = idempotencyKey(rawKey);
  const requestHash = digest(input);
  const prior = await getRemittanceRetry(ctx.userId, key, requestHash);
  if (prior) return { remittance: remittanceDto(prior), created: false };
  try {
    const row = await prisma.$transaction(async (tx) => {
      const retry = await tx.remittance.findUnique({ where: { recordedById_idempotencyKey: { recordedById: ctx.userId, idempotencyKey: key } } });
      if (retry) {
        if (retry.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different remittance.");
        return retry;
      }
      await requireEvent(tx, input.eventId);
      await requireSeller(tx, input.sellerId);
      const receiver = await tx.user.findUnique({ where: { id: input.receivedById }, select: { id: true, active: true, role: true } });
      if (!receiver?.active) throw notFound("Receiving staff member not found.");
      const created = await tx.remittance.create({ data: { ...input, recordedById: ctx.userId, idempotencyKey: key, requestHash } });
      await audit(tx, ctx, "remittance.record", input.eventId, "remittance", created.id, { sellerId: input.sellerId, amountUgx: input.amountUgx, method: input.method, receivedById: input.receivedById });
      return created;
    }, { maxWait: 10_000, timeout: 15_000 });
    return { remittance: remittanceDto(row), created: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const retry = await getRemittanceRetry(ctx.userId, key, requestHash);
      if (retry) return { remittance: remittanceDto(retry), created: false };
    }
    throw error;
  }
}

export async function reverseRemittance(ctx: AuthContext, remittanceId: string, input: RemittanceReverseInput, rawKey: string | null) {
  requirePermission(ctx.role, "remittance:reverse");
  const key = idempotencyKey(rawKey);
  const requestHash = digest({ remittanceId, ...input });
  const prior = await getRemittanceRetry(ctx.userId, key, requestHash);
  if (prior) return { remittance: remittanceDto(prior), created: false };
  try {
    const row = await prisma.$transaction(async (tx) => {
      const retry = await tx.remittance.findUnique({ where: { recordedById_idempotencyKey: { recordedById: ctx.userId, idempotencyKey: key } } });
      if (retry) {
        if (retry.requestHash !== requestHash) throw conflict("This Idempotency-Key was used for a different remittance reversal.");
        return retry;
      }
      const original = await tx.remittance.findUnique({ where: { id: remittanceId } });
      if (!original) throw notFound("Remittance not found.");
      await tx.$queryRaw`SELECT "id" FROM "Remittance" WHERE "id" = ${original.id} FOR UPDATE`;
      const current = await tx.remittance.findUniqueOrThrow({ where: { id: original.id }, include: { reversal: true } });
      if (current.reversesId || current.reversal) throw conflict("This remittance has already been reversed or is itself a reversal.");
      const reversed = await tx.remittance.create({ data: {
        eventId: original.eventId, sellerId: original.sellerId, amountUgx: original.amountUgx, method: original.method,
        receivedById: original.receivedById, recordedById: ctx.userId, note: input.reason,
        reversesId: original.id, idempotencyKey: key, requestHash,
      } });
      await audit(tx, ctx, "remittance.reverse", original.eventId, "remittance", original.id, { reversalId: reversed.id, amountUgx: reversed.amountUgx, reason: input.reason });
      return reversed;
    }, { maxWait: 10_000, timeout: 15_000 });
    return { remittance: remittanceDto(row), created: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const retry = await getRemittanceRetry(ctx.userId, key, requestHash);
      if (retry) return { remittance: remittanceDto(retry), created: false };
      throw conflict("This remittance has already been reversed.");
    }
    throw error;
  }
}
