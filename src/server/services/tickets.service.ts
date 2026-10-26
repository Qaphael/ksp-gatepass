import type { PrintKind, Prisma, TicketStatus } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import type {
  RevokeTicketInput,
  TicketExportQuery,
  TicketListQuery,
} from "@/lib/validation/tickets";
import { conflict, notFound, requirePermission } from "./errors";

/**
 * Ticket inventory reads and lifecycle actions (PRD 5.5, 7.1, 7.5).
 *
 * `tokenHash` and `tokenEnc` never leave this module: the DTO type does not
 * contain them, so a serialised ticket can never leak a token (AGENTS rule 6).
 */

export interface TicketDto {
  id: string;
  serial: string;
  status: TicketStatus;
  eventId: string;
  eventName: string;
  ticketTypeId: string;
  ticketTypeName: string;
  batchId: string | null;
  batchRef: string | null;
  revokeReason: string | null;
  revokedById: string | null;
  createdAt: string;
  updatedAt: string;
}

const DTO_INCLUDE = {
  event: { select: { name: true } },
  ticketType: { select: { name: true } },
  batch: { select: { batchRef: true } },
} as const;

type TicketRecord = Prisma.TicketGetPayload<{ include: typeof DTO_INCLUDE }>;

function toDto(ticket: NonNullable<TicketRecord>): TicketDto {
  return {
    id: ticket.id,
    serial: ticket.serial,
    status: ticket.status,
    eventId: ticket.eventId,
    eventName: ticket.event.name,
    ticketTypeId: ticket.ticketTypeId,
    ticketTypeName: ticket.ticketType.name,
    batchId: ticket.batchId,
    batchRef: ticket.batch?.batchRef ?? null,
    revokeReason: ticket.revokeReason,
    revokedById: ticket.revokedById,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export interface TicketListResult {
  tickets: TicketDto[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listTickets(
  ctx: AuthContext,
  query: TicketListQuery,
): Promise<TicketListResult> {
  requirePermission(ctx.role, "inventory:read");

  const search = query.search?.toUpperCase();
  const where = {
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.ticketTypeId ? { ticketTypeId: query.ticketTypeId } : {}),
    ...(query.batchId ? { batchId: query.batchId } : {}),
    ...(search ? { serial: { contains: search } } : {}),
  };

  const [total, tickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      include: DTO_INCLUDE,
      orderBy: { serial: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    tickets: tickets.map((t) => toDto(t as TicketRecord)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export interface TicketDetail extends TicketDto {
  /** Audit rows that target this ticket (revoke/print/corrections…). */
  auditHistory: Array<{
    id: string;
    action: string;
    actorId: string | null;
    actorRole: string | null;
    outcome: string;
    summary: unknown;
    createdAt: string;
  }>;
  /** Traceable print/export history (PRD 5.6 rule 6). */
  printHistory: Array<{
    id: string;
    kind: PrintKind;
    actorId: string | null;
    ticketCount: number;
    createdAt: string;
  }>;
}

export async function getTicket(ctx: AuthContext, id: string): Promise<TicketDetail> {
  requirePermission(ctx.role, "inventory:read");
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: DTO_INCLUDE });
  if (!ticket) throw notFound("Ticket not found.");

  const [auditRows, printRows] = await Promise.all([
    prisma.auditLog.findMany({
      where: { targetType: "ticket", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.printBatch.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    ...toDto(ticket as TicketRecord),
    auditHistory: auditRows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId,
      actorRole: row.actorRole,
      outcome: row.outcome,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    })),
    printHistory: printRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      actorId: row.actorId,
      ticketCount: row.ticketCount,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/**
 * Revokes inventory with a mandatory reason (business rule 11). Sold tickets
 * are deliberately refused: cancelling a sale is the Phase 3 workflow and must
 * not be reachable by quietly revoking stock. Revocation never un-happens.
 */
export async function revokeTicket(
  ctx: AuthContext,
  id: string,
  input: RevokeTicketInput,
): Promise<TicketDto> {
  requirePermission(ctx.role, "ticket:revoke");

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw notFound("Ticket not found.");
  if (ticket.status === "REVOKED") throw conflict("That ticket is already revoked.");
  if (ticket.status === "CANCELLED") {
    throw conflict("A cancelled ticket cannot be revoked.");
  }
  if (ticket.status === "SOLD") {
    throw conflict(
      "Sold tickets cannot be revoked here — cancel the sale instead so stock and money stay consistent.",
    );
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: { status: "REVOKED", revokeReason: input.reason, revokedById: ctx.userId },
    include: DTO_INCLUDE,
  });

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "ticket.revoke",
    targetType: "ticket",
    targetId: id,
    eventId: ticket.eventId,
    summary: { serial: ticket.serial, reason: input.reason, previousStatus: ticket.status },
  });
  return toDto(updated as TicketRecord);
}

/** Authorised inventory export (PRD 5.5 / 10.3) — never includes tokens. */
export async function exportTickets(
  ctx: AuthContext,
  query: TicketExportQuery,
): Promise<TicketDto[]> {
  requirePermission(ctx.role, "inventory:export");

  const search = query.search?.toUpperCase();
  const tickets = await prisma.ticket.findMany({
    where: {
      eventId: query.eventId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.ticketTypeId ? { ticketTypeId: query.ticketTypeId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(search ? { serial: { contains: search } } : {}),
    },
    include: DTO_INCLUDE,
    orderBy: { serial: "asc" },
    take: 50_000,
  });

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "inventory.export",
    targetType: "event",
    targetId: query.eventId,
    eventId: query.eventId,
    summary: { count: tickets.length, filters: { ...query } },
  });

  return tickets.map((t) => toDto(t as TicketRecord));
}
