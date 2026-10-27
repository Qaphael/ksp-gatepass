import { createHash } from "node:crypto";
import type {
  CheckInMethod,
  Prisma,
  ScanMethod,
  ScanResultCode,
} from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { hashQrToken } from "@/lib/qr/tokens";
import { prisma } from "@/lib/db/client";
import type {
  CheckInCorrectionInput,
  CheckInListQuery,
  ConfirmInput,
  ScanAttemptQuery,
  VerifyQrInput,
  VerifySerialInput,
} from "@/lib/validation/check-in";
import { conflict, notFound, requirePermission } from "./errors";

const ELIGIBILITY_INCLUDE = {
  event: {
    select: {
      id: true,
      name: true,
      admissionOpen: true,
      admissionOpensAt: true,
      admissionClosesAt: true,
      admissionPolicy: true,
      status: true,
    },
  },
  ticketType: { select: { name: true, permitsAdmission: true } },
  saleTickets: {
    take: 1,
    include: {
      sale: {
        select: {
          id: true,
          eventId: true,
          totalUgx: true,
          status: true,
          payments: { include: { adjustments: true } },
        },
      },
    },
  },
  checkIn: { select: { checkedInAt: true, gate: true } },
} satisfies Prisma.TicketInclude;

type EligibilityTicket = Prisma.TicketGetPayload<{ include: typeof ELIGIBILITY_INCLUDE }>;
type Db = typeof prisma | Prisma.TransactionClient;

export interface PublicTicketSummary {
  serial: string;
  ticketTypeName: string;
  eventName: string;
}

export interface EligibilityResult {
  code: ScanResultCode;
  eligible: boolean;
  message: string;
  eventName: string;
  ticket?: PublicTicketSummary;
  originalCheckIn?: { checkedInAt: string; gate: string };
}

export interface ConfirmResult extends EligibilityResult {
  admitted: boolean;
  created: boolean;
  checkedInAt?: string;
  gate?: string;
}

export interface CheckInRecordDto {
  id: string;
  eventId: string;
  eventName: string;
  serial: string;
  ticketTypeName: string;
  gate: string;
  method: CheckInMethod;
  verifier: { id: string; displayName: string };
  checkedInAt: string;
  corrections: Array<{ id: string; reason: string; actorName: string; createdAt: string }>;
}

export interface ScanAttemptDto {
  id: string;
  eventId: string;
  eventName: string;
  serial: string | null;
  method: ScanMethod;
  resultCode: ScanResultCode;
  gate: string | null;
  actor: { id: string; displayName: string };
  attemptedAt: string;
}

const MESSAGE: Record<ScanResultCode, string> = {
  ELIGIBLE: "Ticket is valid. Confirm check-in.",
  ADMITTED: "VALID — ADMITTED.",
  INVALID_QR: "Invalid or unknown QR code.",
  UNKNOWN_SERIAL: "Ticket serial was not found.",
  OTHER_EVENT: "This ticket belongs to another event.",
  NOT_PAID: "Ticket is not fully paid.",
  TICKET_CANCELLED: "This ticket or its sale is cancelled or refunded.",
  TICKET_REVOKED: "This ticket has been revoked.",
  ALREADY_USED: "Ticket has already been checked in.",
  NOT_YET_VALID: "Admission has not opened for this ticket yet.",
  EXPIRED: "The admission window for this ticket has expired.",
  ADMISSION_CLOSED: "Admission is closed for this event.",
  TICKET_NOT_SOLD: "This ticket has not been sold.",
  CATEGORY_NOT_ADMISSIBLE: "This ticket category is not valid for admission.",
};

function normalizeSerial(value: string): string {
  return value.trim().toUpperCase();
}

function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function ticketSummary(ticket: EligibilityTicket): PublicTicketSummary {
  return {
    serial: ticket.serial,
    ticketTypeName: ticket.ticketType.name,
    eventName: ticket.event.name,
  };
}

function totalPaid(ticket: EligibilityTicket): number {
  const sale = ticket.saleTickets[0]?.sale;
  if (!sale) return 0;
  return sale.payments.reduce((paymentSum, payment) => {
    const adjusted = payment.adjustments.reduce((sum, adjustment) => sum + adjustment.amountUgx, 0);
    return paymentSum + payment.amountUgx - adjusted;
  }, 0);
}

function result(
  code: ScanResultCode,
  eventName: string,
  ticket?: EligibilityTicket,
): EligibilityResult {
  return {
    code,
    eligible: code === "ELIGIBLE",
    message: MESSAGE[code],
    eventName,
    ...(ticket ? { ticket: ticketSummary(ticket) } : {}),
    ...(ticket?.checkIn
      ? { originalCheckIn: { checkedInAt: ticket.checkIn.checkedInAt.toISOString(), gate: ticket.checkIn.gate } }
      : {}),
  };
}

function evaluate(
  event: {
    id: string;
    name: string;
    admissionOpen: boolean;
    admissionOpensAt: Date | null;
    admissionClosesAt: Date | null;
    admissionPolicy: string;
    status: string;
  },
  ticket: EligibilityTicket | null,
  unknownCode: "INVALID_QR" | "UNKNOWN_SERIAL",
  now = new Date(),
): EligibilityResult {
  if (!ticket) return result(unknownCode, event.name);
  if (ticket.eventId !== event.id) return result("OTHER_EVENT", event.name, ticket);
  if (ticket.checkIn) return result("ALREADY_USED", event.name, ticket);
  if (ticket.status === "CANCELLED") return result("TICKET_CANCELLED", event.name, ticket);
  if (ticket.status === "REVOKED") return result("TICKET_REVOKED", event.name, ticket);
  if (ticket.status !== "SOLD") return result("TICKET_NOT_SOLD", event.name, ticket);

  const sale = ticket.saleTickets[0]?.sale;
  if (!sale || sale.eventId !== event.id || ["CANCELLED", "REFUNDED"].includes(sale.status)) {
    return result("TICKET_CANCELLED", event.name, ticket);
  }
  if (event.admissionPolicy === "FULL_PAYMENT" && (sale.status !== "PAID" || totalPaid(ticket) < sale.totalUgx)) {
    return result("NOT_PAID", event.name, ticket);
  }
  if (!ticket.ticketType.permitsAdmission) return result("CATEGORY_NOT_ADMISSIBLE", event.name, ticket);
  if (event.admissionOpensAt && now < event.admissionOpensAt) return result("NOT_YET_VALID", event.name, ticket);
  if (event.admissionClosesAt && now >= event.admissionClosesAt) return result("EXPIRED", event.name, ticket);
  if (!event.admissionOpen || event.status === "COMPLETED" || event.status === "ARCHIVED") {
    return result("ADMISSION_CLOSED", event.name, ticket);
  }
  return result("ELIGIBLE", event.name, ticket);
}

async function getEvent(ctx: AuthContext, db: Db, eventId: string) {
  requirePermission(ctx.role, "event:read");
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      admissionOpen: true,
      admissionOpensAt: true,
      admissionClosesAt: true,
      admissionPolicy: true,
      status: true,
    },
  });
  if (!event) throw notFound("Event not found.");
  return event;
}

async function findTicket(db: Db, input: { method: "QR" | "MANUAL"; token?: string; serial?: string }) {
  if (input.method === "QR") {
    return db.ticket.findUnique({ where: { tokenHash: hashQrToken(input.token ?? "") }, include: ELIGIBILITY_INCLUDE });
  }
  return db.ticket.findUnique({ where: { serial: normalizeSerial(input.serial ?? "") }, include: ELIGIBILITY_INCLUDE });
}

async function recordAttempt(
  db: Db,
  ctx: AuthContext,
  eventId: string,
  method: ScanMethod,
  code: ScanResultCode,
  options: { ticketId?: string; serial?: string | null; gate?: string | null } = {},
) {
  return db.scanAttempt.create({
    data: {
      eventId,
      actorId: ctx.userId,
      ticketId: options.ticketId ?? null,
      method,
      resultCode: code,
      gate: options.gate ?? null,
      serial: options.serial ?? null,
    },
  });
}

export async function verifyQr(ctx: AuthContext, input: VerifyQrInput): Promise<EligibilityResult> {
  requirePermission(ctx.role, "checkin:verify");
  const event = await getEvent(ctx, prisma, input.eventId);
  const ticket = await findTicket(prisma, { method: "QR", token: input.token });
  const verification = evaluate(event, ticket, "INVALID_QR");
  await recordAttempt(prisma, ctx, event.id, "QR", verification.code, {
    ...(ticket ? { ticketId: ticket.id, serial: ticket.serial } : {}),
    gate: input.gate,
  });
  return verification;
}

export async function verifySerial(ctx: AuthContext, input: VerifySerialInput): Promise<EligibilityResult> {
  requirePermission(ctx.role, "checkin:verify");
  const event = await getEvent(ctx, prisma, input.eventId);
  const serial = normalizeSerial(input.serial);
  const ticket = await findTicket(prisma, { method: "MANUAL", serial });
  const verification = evaluate(event, ticket, "UNKNOWN_SERIAL");
  await recordAttempt(prisma, ctx, event.id, "SERIAL", verification.code, {
    ...(ticket ? { ticketId: ticket.id } : {}),
    serial: ticket?.serial ?? serial,
    gate: input.gate,
  });
  return verification;
}

function checkIdempotencyKey(key: string | null): string {
  const trimmed = key?.trim();
  if (!trimmed || trimmed.length > 128) throw conflict("Confirm requires an Idempotency-Key of at most 128 characters.");
  return trimmed;
}

function checkInDto(record: {
  checkedInAt: Date;
  gate: string;
  event: { name: string };
  ticket: { serial: string; ticketType: { name: string } };
}): Pick<ConfirmResult, "checkedInAt" | "gate" | "ticket" | "eventName"> {
  return {
    checkedInAt: record.checkedInAt.toISOString(),
    gate: record.gate,
    eventName: record.event.name,
    ticket: {
      serial: record.ticket.serial,
      ticketTypeName: record.ticket.ticketType.name,
      eventName: record.event.name,
    },
  };
}

const CONFIRM_INCLUDE = {
  event: { select: { name: true } },
  ticket: { include: { ticketType: { select: { name: true } } } },
} as const;

function idempotentSuccess(
  record: Prisma.CheckInGetPayload<{ include: typeof CONFIRM_INCLUDE }>,
): ConfirmResult {
  return {
    code: "ADMITTED",
    admitted: true,
    created: false,
    eligible: false,
    message: MESSAGE.ADMITTED,
    ...checkInDto(record),
  };
}

function transactionAudit(
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

export async function confirmCheckIn(
  ctx: AuthContext,
  input: ConfirmInput,
  rawKey: string | null,
): Promise<ConfirmResult> {
  requirePermission(ctx.role, "checkin:confirm");
  const key = checkIdempotencyKey(rawKey);
  const requestHash = payloadHash(input);
  await getEvent(ctx, prisma, input.eventId);
  const prior = await prisma.checkIn.findUnique({ where: { idempotencyKey: key }, include: CONFIRM_INCLUDE });
  if (prior) {
    if (prior.requestHash !== requestHash) throw conflict("This Idempotency-Key was already used for a different check-in.");
    return idempotentSuccess(prior);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // A shared event lock allows concurrent admits but serializes event close/open transitions.
      const lockedEvents = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Event" WHERE id = ${input.eventId} FOR SHARE`;
      if (!lockedEvents[0]) throw notFound("Event not found.");

      let candidate = await findTicket(tx, input);
      if (candidate) {
        const candidateId = candidate.id;
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${candidateId} FOR UPDATE`;
        const idempotentRetry = await tx.checkIn.findUnique({ where: { idempotencyKey: key }, include: CONFIRM_INCLUDE });
        if (idempotentRetry) {
          if (idempotentRetry.requestHash !== requestHash) throw conflict("This Idempotency-Key was already used for a different check-in.");
          return idempotentSuccess(idempotentRetry);
        }
        candidate = await tx.ticket.findUnique({ where: { id: candidateId }, include: ELIGIBILITY_INCLUDE });
        const saleId = candidate?.saleTickets[0]?.sale.id;
        if (saleId) {
          await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR SHARE`;
          candidate = await tx.ticket.findUnique({ where: { id: candidateId }, include: ELIGIBILITY_INCLUDE });
        }
      }

      const event = await getEvent(ctx, tx, input.eventId);
      const verified = evaluate(event, candidate, input.method === "QR" ? "INVALID_QR" : "UNKNOWN_SERIAL");
      if (!verified.eligible || !candidate) {
        await recordAttempt(tx, ctx, event.id, input.method === "QR" ? "QR" : "SERIAL", verified.code, {
          ...(candidate ? { ticketId: candidate.id } : {}),
          serial: input.method === "MANUAL" ? candidate?.serial ?? normalizeSerial(input.serial) : candidate?.serial ?? null,
          gate: input.gate,
        });
        await transactionAudit(tx, ctx, "checkin.confirm.rejected", "event", event.id, event.id, {
          code: verified.code,
          ...(candidate ? { serial: candidate.serial } : {}),
          method: input.method,
          gate: input.gate,
        });
        return { ...verified, admitted: false, created: false };
      }

      const checkIn = await tx.checkIn.create({
        data: {
          eventId: event.id,
          ticketId: candidate.id,
          verifierId: ctx.userId,
          gate: input.gate,
          method: input.method,
          idempotencyKey: key,
          requestHash,
        },
        include: CONFIRM_INCLUDE,
      });
      await recordAttempt(tx, ctx, event.id, input.method === "QR" ? "QR" : "SERIAL", "ADMITTED", {
        ticketId: candidate.id,
        serial: candidate.serial,
        gate: input.gate,
      });
      await transactionAudit(tx, ctx, "checkin.admit", "checkin", checkIn.id, event.id, {
        serial: candidate.serial,
        ticketType: candidate.ticketType.name,
        gate: input.gate,
        method: input.method,
      });
      return {
        code: "ADMITTED",
        admitted: true,
        created: true,
        eligible: false,
        message: MESSAGE.ADMITTED,
        ...checkInDto(checkIn),
      };
    }, { maxWait: 10_000, timeout: 15_000 });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "P2002") {
      const sameKey = await prisma.checkIn.findUnique({ where: { idempotencyKey: key }, include: CONFIRM_INCLUDE });
      if (sameKey) {
        if (sameKey.requestHash !== requestHash) throw conflict("This Idempotency-Key was already used for a different check-in.");
        return idempotentSuccess(sameKey);
      }
      const ticket = await findTicket(prisma, input);
      if (ticket) {
        const existing = await prisma.checkIn.findUnique({ where: { ticketId: ticket.id }, include: CONFIRM_INCLUDE });
        if (existing) {
          const event = await getEvent(ctx, prisma, input.eventId);
          const duplicate = result("ALREADY_USED", event.name, ticket);
          return { ...duplicate, admitted: false, created: false };
        }
      }
    }
    throw error;
  }
}

export async function listRecentCheckIns(ctx: AuthContext, query: CheckInListQuery) {
  requirePermission(ctx.role, "checkin:read-recent");
  const event = await getEvent(ctx, prisma, query.eventId);
  const rows = await prisma.checkIn.findMany({
    where: { eventId: event.id, ...(query.before ? { checkedInAt: { lt: query.before } } : {}) },
    include: {
      event: { select: { name: true } },
      ticket: { include: { ticketType: { select: { name: true } } } },
      verifier: { select: { id: true, displayName: true } },
      corrections: {
        include: { actor: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { checkedInAt: "desc" },
    take: query.limit,
  });
  return rows.map((row) => toCheckInRecord(row));
}

function toCheckInRecord(row: {
  id: string;
  eventId: string;
  event: { name: string };
  ticket: { serial: string; ticketType: { name: string } };
  gate: string;
  method: CheckInMethod;
  verifier: { id: string; displayName: string };
  checkedInAt: Date;
  corrections: Array<{ id: string; reason: string; createdAt: Date; actor: { displayName: string } }>;
}): CheckInRecordDto {
  return {
    id: row.id,
    eventId: row.eventId,
    eventName: row.event.name,
    serial: row.ticket.serial,
    ticketTypeName: row.ticket.ticketType.name,
    gate: row.gate,
    method: row.method,
    verifier: row.verifier,
    checkedInAt: row.checkedInAt.toISOString(),
    corrections: row.corrections.map((correction) => ({
      id: correction.id,
      reason: correction.reason,
      actorName: correction.actor.displayName,
      createdAt: correction.createdAt.toISOString(),
    })),
  };
}

export async function getAttendanceSummary(ctx: AuthContext, eventId: string) {
  requirePermission(ctx.role, "checkin:read-summary");
  const event = await getEvent(ctx, prisma, eventId);
  const [checkIns, ticketsSold] = await Promise.all([
    prisma.checkIn.count({ where: { eventId } }),
    prisma.ticket.count({ where: { eventId, status: "SOLD" } }),
  ]);
  const fullEvent = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { capacity: true } });
  return {
    eventId,
    eventName: event.name,
    checkedIn: checkIns,
    ticketsSold,
    notYetCheckedIn: Math.max(0, ticketsSold - checkIns),
    capacity: fullEvent.capacity,
  };
}

export async function listScanAttempts(ctx: AuthContext, query: ScanAttemptQuery) {
  requirePermission(ctx.role, "checkin:read-attempts");
  const event = await getEvent(ctx, prisma, query.eventId);
  const rows = await prisma.scanAttempt.findMany({
    where: {
      eventId: event.id,
      ...(query.method ? { method: query.method } : {}),
      ...(query.resultCode ? { resultCode: query.resultCode } : {}),
      ...(query.before ? { attemptedAt: { lt: query.before } } : {}),
    },
    include: {
      event: { select: { name: true } },
      actor: { select: { id: true, displayName: true } },
      ticket: { select: { serial: true } },
    },
    orderBy: { attemptedAt: "desc" },
    take: query.limit,
  });
  return rows.map((row): ScanAttemptDto => ({
    id: row.id,
    eventId: row.eventId,
    eventName: row.event.name,
    serial: row.ticket?.serial ?? row.serial,
    method: row.method,
    resultCode: row.resultCode,
    gate: row.gate,
    actor: row.actor,
    attemptedAt: row.attemptedAt.toISOString(),
  }));
}

export async function recordCheckInCorrection(
  ctx: AuthContext,
  checkInId: string,
  input: CheckInCorrectionInput,
) {
  requirePermission(ctx.role, "checkin:override");
  return prisma.$transaction(async (tx) => {
    const checkIn = await tx.checkIn.findUnique({
      where: { id: checkInId },
      include: { event: { select: { id: true } }, ticket: { select: { serial: true } } },
    });
    if (!checkIn) throw notFound("Check-in record not found.");
    await getEvent(ctx, tx, checkIn.event.id);
    if (normalizeSerial(input.confirmedTicketSerial) !== checkIn.ticket.serial) {
      throw conflict("Confirmed serial does not match this check-in record.");
    }
    const correction = await tx.checkInCorrection.create({
      data: {
        checkInId,
        actorId: ctx.userId,
        confirmedTicketSerial: checkIn.ticket.serial,
        reason: input.reason,
      },
    });
    await transactionAudit(tx, ctx, "checkin.correction", "checkin", checkInId, checkIn.event.id, {
      serial: checkIn.ticket.serial,
      reason: input.reason,
      correctionId: correction.id,
      admissionRecordPreserved: true,
    });
    return {
      id: correction.id,
      checkInId,
      serial: checkIn.ticket.serial,
      reason: correction.reason,
      createdAt: correction.createdAt.toISOString(),
    };
  });
}
