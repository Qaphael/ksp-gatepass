import { createHash, randomBytes } from "node:crypto";
import { Prisma, type SaleEntryMethod, type SaleStatus, type ScanResultCode } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/db/client";
import { hashQrToken } from "@/lib/qr/tokens";
import { sanitizeAuditData } from "@/lib/audit";
import { normalizeUgandaPhone } from "@/lib/phone/uganda";
import type {
  PaymentAdjustmentInput,
  PaymentCreateInput,
  SaleLookupTicketInput,
  SaleCreateInput,
  SaleListQuery,
} from "@/lib/validation/sales";
import { conflict, forbidden, notFound, requirePermission, ServiceError, validationError } from "./errors";

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
      summary: sanitizeAuditData(summary) as Prisma.InputJsonValue,
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
  const bulk = "items" in input;
  if (bulk && ctx.role !== "ADMIN" && ctx.role !== "SUPER_ADMIN") throw forbidden("Quantity-based ticket sales are restricted to administrators.");
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
        requireBuyerDetails: boolean; requireStockIssue: boolean; allowSellerManualSale: boolean; requireFullPaymentAtSale: boolean;
      }>>`SELECT id, name, venue, "organiserContact", "salesOpen", status, "salesOpensAt", "salesClosesAt", "requireBuyerDetails", "requireStockIssue", "allowSellerManualSale", "requireFullPaymentAtSale" FROM "Event" WHERE id = ${input.eventId} FOR UPDATE`;
      const event = locked[0];
      if (!event) throw notFound("Event not found.");
      const now = new Date();
      if (!event.salesOpen || event.status === "COMPLETED" || event.status === "ARCHIVED") {
        throw conflict("Sales are not open for this event.");
      }
      if ((event.salesOpensAt && event.salesOpensAt > now) || (event.salesClosesAt && event.salesClosesAt <= now)) {
        throw conflict("This event is outside its sales window.");
      }

      let subtotalUgx = 0;
      let ticketCount = 0;
      let scannedRecords: Array<{ ticketId: string; entryMethod: SaleEntryMethod }> = [];
      let custodyReleaseIds: string[] = [];
      let scannedSerials: string[] = [];
      let lines: Array<{ ticketTypeId: string; quantity: number; unitPriceUgx: number; lineTotalUgx: number; type: { id: string; name: string }; ticketIds?: string[]; entryMethod?: SaleEntryMethod }>;

      if (bulk) {
        lines = [];
        const types = await tx.ticketType.findMany({ where: { id: { in: input.items.map((item) => item.ticketTypeId) }, eventId: event.id } });
        if (types.length !== input.items.length) throw notFound("One or more ticket categories were not found for this event.");
        const byId = new Map(types.map((type) => [type.id, type]));
        lines = input.items.map((item) => {
          const type = byId.get(item.ticketTypeId)!;
          if (type.status !== "ACTIVE") throw conflict(`Ticket category “${type.name}” is inactive.`);
          if ((type.salesOpensAt && type.salesOpensAt > now) || (type.salesClosesAt && type.salesClosesAt <= now)) throw conflict(`Ticket category “${type.name}” is outside its sales window.`);
          const lineTotalUgx = type.priceUgx * item.quantity;
          if (!Number.isSafeInteger(lineTotalUgx)) throw conflict("Sale total exceeds the supported amount.");
          subtotalUgx += lineTotalUgx; ticketCount += item.quantity;
          return { ...item, unitPriceUgx: type.priceUgx, lineTotalUgx, type };
        });
      } else {
        const entries = input.tickets.map((entry) => ({
          identity: "token" in entry ? hashQrToken(entry.token) : entry.serial.trim().toUpperCase(),
          byToken: "token" in entry,
          entryMethod: ("token" in entry ? "SCAN" : "MANUAL") as SaleEntryMethod,
        }));
        if (new Set(entries.map((entry) => `${entry.byToken ? "t:" : "s:"}${entry.identity}`)).size !== entries.length) throw conflict("A ticket can appear only once in a sale.");
        if (entries.some((entry) => entry.entryMethod === "MANUAL") && !(ctx.role === "ADMIN" || ctx.role === "SUPER_ADMIN" || (ctx.role === "SELLER" && event.allowSellerManualSale))) {
          throw forbidden("Manual serial sales are not enabled for this seller.");
        }
        const resolved: Array<{ id: string; entryMethod: SaleEntryMethod }> = [];
        for (const entry of entries) {
          const ticket = await tx.ticket.findUnique({ where: entry.byToken ? { tokenHash: entry.identity } : { serial: entry.identity }, select: { id: true } });
          if (!ticket) throw conflict(entry.byToken ? "Ticket QR is unknown or invalid." : "Ticket serial was not found.");
          resolved.push({ id: ticket.id, entryMethod: entry.entryMethod });
        }
        if (new Set(resolved.map((ticket) => ticket.id)).size !== resolved.length) throw conflict("A ticket can appear only once in a sale.");
        const ids = resolved.map((ticket) => ticket.id).sort();
        if (ids.length) await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
        const tickets = await tx.ticket.findMany({
          where: { id: { in: ids } },
          include: { ticketType: true, saleTickets: { take: 1, select: { id: true } } },
        });
        if (tickets.length !== resolved.length) throw conflict("Ticket inventory changed. Please retry the sale.");
        for (const ticket of tickets) {
          if (ticket.eventId !== event.id) throw conflict("This ticket belongs to another event.");
          if (ticket.status === "SOLD" || ticket.saleTickets.length) throw conflict("This ticket has already been sold.");
          if (ticket.status === "CANCELLED" || ticket.status === "REVOKED") throw conflict("Cancelled or revoked tickets cannot be sold.");
          if (ticket.status !== "AVAILABLE") throw conflict("This ticket is not available for sale.");
          if (ticket.ticketType.status !== "ACTIVE") throw conflict(`Ticket category “${ticket.ticketType.name}” is inactive.`);
          if ((ticket.ticketType.salesOpensAt && ticket.ticketType.salesOpensAt > now) || (ticket.ticketType.salesClosesAt && ticket.ticketType.salesClosesAt <= now)) throw conflict(`Ticket category “${ticket.ticketType.name}” is outside its sales window.`);
        }
        scannedSerials = tickets.map((ticket) => ticket.serial);
        const activeCustodies = await tx.ticketCustody.findMany({
          where: { ticketId: { in: ids }, releasedAt: null },
          select: { id: true, ticketId: true, sellerId: true },
        });
        const custodyByTicket = new Map(activeCustodies.map((custody) => [custody.ticketId, custody]));
        if (ctx.role === "SELLER" && event.requireStockIssue) {
          const notHeldBySeller = tickets.filter((ticket) => custodyByTicket.get(ticket.id)?.sellerId !== ctx.userId);
          if (notHeldBySeller.length) throw conflict("This ticket is not issued to you. Ask an administrator to issue it before selling.");
        }
        custodyReleaseIds = activeCustodies.map((custody) => custody.id);
        const grouped = new Map<string, typeof tickets>();
        for (const ticket of tickets) grouped.set(ticket.ticketTypeId, [...(grouped.get(ticket.ticketTypeId) ?? []), ticket]);
        lines = [...grouped.entries()].map(([ticketTypeId, categoryTickets]) => {
          const type = categoryTickets[0].ticketType;
          const lineTotalUgx = type.priceUgx * categoryTickets.length;
          if (!Number.isSafeInteger(lineTotalUgx)) throw conflict("Sale total exceeds the supported amount.");
          subtotalUgx += lineTotalUgx; ticketCount += categoryTickets.length;
          return { ticketTypeId, quantity: categoryTickets.length, unitPriceUgx: type.priceUgx, lineTotalUgx, type, ticketIds: categoryTickets.map((ticket) => ticket.id) };
        });
        scannedRecords = resolved.map((ticket) => ({ ticketId: ticket.id, entryMethod: ticket.entryMethod }));
      }
      if (!Number.isSafeInteger(subtotalUgx) || subtotalUgx > 2_000_000_000) throw conflict("Sale total exceeds the supported amount.");
      const discountUgx = input.discountUgx ?? 0;
      if (discountUgx > subtotalUgx) throw conflict("Discount cannot exceed the sale subtotal.");
      const totalUgx = subtotalUgx - discountUgx;
      if (input.initialPayment && input.initialPayment.amountUgx > totalUgx) {
        throw conflict("Initial payment cannot exceed the sale total.");
      }
      if (event.requireBuyerDetails && (!input.customerName || !input.customerPhone)) throw validationError("Buyer name and phone are required for this event.");
      let customerPhoneNormalized: string | null = null;
      if (input.customerPhone) {
        try { customerPhoneNormalized = normalizeUgandaPhone(input.customerPhone); }
        catch (error) { throw validationError(error instanceof Error ? error.message : "Enter a valid Ugandan mobile number."); }
      }
        if (!bulk && ctx.role !== "ADMIN" && ctx.role !== "SUPER_ADMIN" && event.requireFullPaymentAtSale && (input.initialPayment?.amountUgx ?? 0) < totalUgx) {
        throw conflict("Full payment is required before a seller can confirm this physical ticket sale.");
      }

      const sale = await tx.sale.create({
        data: {
          reference: reference("SALE"),
          eventId: event.id,
          sellerId: ctx.userId,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          customerPhoneNormalized,
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
        const tickets = line.ticketIds
          ? line.ticketIds.map((id) => ({ id }))
          : await tx.$queryRaw<Array<{ id: string }>>`
              SELECT t."id"
              FROM "Ticket" t
              WHERE t."eventId" = ${event.id}
                AND t."ticketTypeId" = ${line.ticketTypeId}
                AND t."status" = 'AVAILABLE'::"TicketStatus"
                AND NOT EXISTS (SELECT 1 FROM "TicketCustody" c WHERE c."ticketId" = t."id" AND c."releasedAt" IS NULL)
              ORDER BY t."createdAt" ASC, t."serial" ASC
              LIMIT ${line.quantity}
              FOR UPDATE OF t SKIP LOCKED`;
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
          data: tickets.map((ticket) => ({ saleId: sale.id, saleItemId: item.id, ticketId: ticket.id,
            entryMethod: scannedRecords.find((record) => record.ticketId === ticket.id)?.entryMethod ?? "BULK",
            ...(scannedRecords.some((record) => record.ticketId === ticket.id) ? { scannedAt: now } : {}),
          })),
        });
      }

      if (custodyReleaseIds.length) {
        const released = await tx.ticketCustody.updateMany({
          where: { id: { in: custodyReleaseIds }, releasedAt: null },
          data: { releasedAt: now, releaseReason: "SOLD", releasedById: ctx.userId, releaseNote: `Sale ${sale.reference}` },
        });
        if (released.count !== custodyReleaseIds.length) throw conflict("Ticket custody changed. Please retry the sale.");
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
        reference: sale.reference, totalUgx, ticketCount,
        entryMethods: bulk ? { bulk: ticketCount } : scannedRecords.reduce<Record<string, number>>((counts, row) => { counts[row.entryMethod] = (counts[row.entryMethod] ?? 0) + 1; return counts; }, {}),
        initialPaymentUgx: input.initialPayment?.amountUgx ?? 0,
        discountUgx,
        ...(discountUgx > 0 ? { discountReason: input.discountReason } : {}),
      });
      if (!bulk && event.requireStockIssue && (ctx.role === "ADMIN" || ctx.role === "SUPER_ADMIN" || ctx.role === "SUPERVISOR")) {
        await auditInTransaction(tx, ctx, "stock.sale.override", "sale", sale.id, event.id, {
          serials: scannedSerials,
          note: "Admin or supervisor sale bypassed the seller stock custody requirement.",
        });
      }
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

export interface SaleLookupResult {
  state: ScanResultCode;
  message: string;
  ticket?: { serial: string; ticketTypeName: string; priceUgx: number };
  requireBuyerDetails: boolean;
  requireFullPaymentAtSale: boolean;
  buyerNoticeText: string | null;
}

const SALE_STATE_MESSAGE: Record<string, string> = {
  SALEABLE: "Ticket is available to sell.",
  INVALID_QR: "QR code is unknown or invalid.",
  UNKNOWN_SERIAL: "Ticket serial was not found.",
  OTHER_EVENT: "This ticket belongs to another event.",
  ALREADY_SOLD: "This ticket has already been sold.",
  ISSUED_TO_ANOTHER_SELLER: "This ticket is held by another seller.",
  NOT_ISSUED_TO_YOU: "This ticket has not been issued to you.",
  TICKET_CANCELLED: "This ticket has been cancelled.",
  TICKET_REVOKED: "This ticket has been revoked.",
  SALES_CLOSED: "Sales are closed for this event or ticket category.",
  TICKET_TYPE_INACTIVE: "This ticket category is inactive.",
  EVENT_NOT_SELLING: "This event is not selling tickets.",
};

/** Ticket lookup is read-only except for its token-free SALE scan-attempt record. */
export async function lookupTicketForSale(ctx: AuthContext, input: SaleLookupTicketInput): Promise<SaleLookupResult> {
  requirePermission(ctx.role, "sale:lookup-ticket");
  requirePermission(ctx.role, "event:read");
  const now = new Date();
  const recent = await prisma.scanAttempt.count({ where: { actorId: ctx.userId, purpose: "SALE", attemptedAt: { gte: new Date(now.getTime() - 60_000) } } });
  if (recent >= 90) throw new ServiceError(429, "RATE_LIMITED", "Too many ticket lookups. Wait a minute and try again.");
  const event = await prisma.event.findUnique({ where: { id: input.eventId }, select: { id: true, name: true, status: true, salesOpen: true, salesOpensAt: true, salesClosesAt: true, requireBuyerDetails: true, requireStockIssue: true, requireFullPaymentAtSale: true, buyerNoticeText: true } });
  if (!event) throw notFound("Event not found.");
  const ticket = input.token
    ? await prisma.ticket.findUnique({ where: { tokenHash: hashQrToken(input.token) }, include: { ticketType: true } })
    : await prisma.ticket.findUnique({ where: { serial: input.serial!.trim().toUpperCase() }, include: { ticketType: true } });
  let state: ScanResultCode = input.token ? "INVALID_QR" : "UNKNOWN_SERIAL";
  if (ticket) {
    if (ticket.eventId !== event.id) state = "OTHER_EVENT";
    else if (ticket.status === "SOLD") state = "ALREADY_SOLD";
    else if (ticket.status === "CANCELLED") state = "TICKET_CANCELLED";
    else if (ticket.status === "REVOKED") state = "TICKET_REVOKED";
    else if (ticket.ticketType.status !== "ACTIVE") state = "TICKET_TYPE_INACTIVE";
    else if (event.status === "DRAFT" || event.status === "COMPLETED" || event.status === "ARCHIVED") state = "EVENT_NOT_SELLING";
    else if (!event.salesOpen || (event.salesOpensAt && event.salesOpensAt > now) || (event.salesClosesAt && event.salesClosesAt <= now) || (ticket.ticketType.salesOpensAt && ticket.ticketType.salesOpensAt > now) || (ticket.ticketType.salesClosesAt && ticket.ticketType.salesClosesAt <= now)) state = "SALES_CLOSED";
    else if (ticket.status === "AVAILABLE" && ctx.role === "SELLER" && event.requireStockIssue) {
      const custody = await prisma.ticketCustody.findFirst({ where: { ticketId: ticket.id, releasedAt: null }, select: { sellerId: true } });
      state = custody?.sellerId === ctx.userId ? "SALEABLE" : custody ? "ISSUED_TO_ANOTHER_SELLER" : "NOT_ISSUED_TO_YOU";
    }
    else if (ticket.status === "AVAILABLE") state = "SALEABLE";
  }
  const method = input.token ? "QR" : "SERIAL";
  const safeSerial = ticket?.eventId === event.id ? ticket.serial : input.serial ? input.serial.trim().toUpperCase() : null;
  await prisma.$transaction(async (tx) => {
    await tx.scanAttempt.create({ data: {
      eventId: event.id, actorId: ctx.userId, ticketId: ticket?.id ?? null,
      method, purpose: "SALE", resultCode: state, serial: safeSerial,
    } });
    await tx.auditLog.create({ data: {
      actorId: ctx.userId, actorRole: ctx.role, action: "sale.ticket.lookup",
      targetType: ticket?.eventId === event.id ? "ticket" : "event",
      targetId: ticket?.eventId === event.id ? ticket.id : event.id,
      eventId: event.id, summary: sanitizeAuditData({ method, result: state, ...(safeSerial ? { serial: safeSerial } : {}) }) as Prisma.InputJsonValue,
    } });
  });
  return {
    state,
    message: SALE_STATE_MESSAGE[state] ?? "Ticket cannot be sold in its current state.",
    ...(state === "SALEABLE" && ticket ? { ticket: { serial: ticket.serial, ticketTypeName: ticket.ticketType.name, priceUgx: ticket.ticketType.priceUgx } } : {}),
    requireBuyerDetails: event.requireBuyerDetails,
    requireFullPaymentAtSale: event.requireFullPaymentAtSale,
    buyerNoticeText: event.buyerNoticeText,
  };
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
