import type { TicketStatus } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { renderTicketsPdf, type TicketPrintRow } from "@/lib/pdf/ticket";
import { decryptToken } from "@/lib/qr/token-vault";
import { conflict, notFound, requirePermission } from "./errors";

/**
 * Authorised print flows (PRD 5.6, business rules 6/8/11).
 *
 * This is the ONLY module that decrypts `tokenEnc` — raw tokens go straight
 * into the PDF renderer and are never returned by an API, logged or audited.
 * Every output records a `PrintBatch` and an audit row, and happens only after
 * the PDF rendered successfully (nothing to trace = nothing happened).
 */

/** Cancelled/revoked inventory can never be printed again (rule 8). */
const PRINTABLE_STATUS: { notIn: TicketStatus[] } = { notIn: ["CANCELLED", "REVOKED"] };

const EVENT_SELECT = {
  name: true,
  venue: true,
  address: true,
  eventDate: true,
  startTime: true,
  endTime: true,
  accentColor: true,
  ticketFooterText: true,
  organiserContact: true,
} as const;

const TICKET_TYPE_SELECT = { name: true, printLabel: true } as const;

type PrintableTicket = {
  serial: string;
  tokenEnc: string;
  event: {
    name: string;
    venue: string;
    address: string | null;
    eventDate: Date;
    startTime: string;
    endTime: string;
    accentColor: string | null;
    ticketFooterText: string | null;
    organiserContact: string | null;
  };
  ticketType: { name: string; printLabel: string | null };
};

function toRow(ticket: PrintableTicket): TicketPrintRow {
  return {
    serial: ticket.serial,
    token: decryptToken(ticket.tokenEnc),
    ticketTypeName: ticket.ticketType.name,
    printLabel: ticket.ticketType.printLabel,
    event: {
      name: ticket.event.name,
      venue: ticket.event.venue,
      address: ticket.event.address,
      eventDate: ticket.event.eventDate.toISOString().slice(0, 10),
      startTime: ticket.event.startTime,
      endTime: ticket.event.endTime,
      accentColor: ticket.event.accentColor,
      ticketFooterText: ticket.event.ticketFooterText,
      organiserContact: ticket.event.organiserContact,
    },
  };
}

export interface PrintJob {
  pdf: Buffer;
  filename: string;
  ticketCount: number;
  /** Tickets skipped because they are cancelled or revoked (full runs only). */
  skipped: number;
  printBatchId: string;
}

export type PrintMode = "full" | "sample";

/**
 * Prints a whole generation batch, or the first printable ticket as a sample
 * (PRD 5.6 rule 4: always be able to test-print before a production run).
 */
export async function printBatch(
  ctx: AuthContext,
  batchId: string,
  mode: PrintMode,
): Promise<PrintJob> {
  requirePermission(ctx.role, "ticket:print");

  const batch = await prisma.ticketBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound("Batch not found.");

  const [totalInBatch, printableCount] = await Promise.all([
    prisma.ticket.count({ where: { batchId } }),
    prisma.ticket.count({ where: { batchId, status: PRINTABLE_STATUS } }),
  ]);

  const tickets = await prisma.ticket.findMany({
    where: { batchId, status: PRINTABLE_STATUS },
    orderBy: { serial: "asc" },
    ...(mode === "sample" ? { take: 1 } : {}),
    select: {
      serial: true,
      tokenEnc: true,
      event: { select: EVENT_SELECT },
      ticketType: { select: TICKET_TYPE_SELECT },
    },
  });

  if (tickets.length === 0) {
    throw conflict("There are no printable tickets in this batch.");
  }

  // Full run: report stock that was excluded because it is revoked/cancelled.
  const skipped = mode === "full" ? totalInBatch - printableCount : 0;
  const rows = tickets.map(toRow);
  const pdf = await renderTicketsPdf(rows);

  // Trace only what actually happened (rule 6), after a successful render.
  const printBatchRecord = await prisma.printBatch.create({
    data: {
      kind: mode === "sample" ? "SAMPLE" : "PRODUCTION",
      eventId: batch.eventId,
      ticketBatchId: batch.id,
      ticketCount: rows.length,
      actorId: ctx.userId,
      metadata: {
        batchRef: batch.batchRef,
        mode,
        serialFirst: rows[0].serial,
        serialLast: rows[rows.length - 1].serial,
        skipped,
      },
    },
  });

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: mode === "sample" ? "ticket-batch.print-sample" : "ticket-batch.print",
    targetType: "ticket-batch",
    targetId: batch.id,
    eventId: batch.eventId,
    summary: {
      batchRef: batch.batchRef,
      ticketCount: rows.length,
      skipped,
      printBatchId: printBatchRecord.id,
    },
  });

  return {
    pdf,
    filename:
      mode === "sample"
        ? `ksp-sample-${batch.batchRef}.pdf`
        : `ksp-${batch.batchRef}.pdf`,
    ticketCount: rows.length,
    skipped,
    printBatchId: printBatchRecord.id,
  };
}

/**
 * Prints or reprints a single ticket. The first output is PRODUCTION; any
 * later output requires the stronger `ticket:reprint` permission and is
 * audited as a reprint. The token never changes (rule 8).
 */
export async function printTicket(ctx: AuthContext, ticketId: string): Promise<PrintJob> {
  requirePermission(ctx.role, "ticket:print");

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      serial: true,
      status: true,
      eventId: true,
      tokenEnc: true,
      event: { select: EVENT_SELECT },
      ticketType: { select: TICKET_TYPE_SELECT },
      _count: { select: { printBatches: true } },
    },
  });
  if (!ticket) throw notFound("Ticket not found.");
  if (ticket.status === "REVOKED") {
    throw conflict("A revoked ticket can never be printed or reprinted.");
  }
  if (ticket.status === "CANCELLED") {
    throw conflict("A cancelled ticket can never be printed.");
  }

  const priorPrints = ticket._count.printBatches;
  const isReprint = priorPrints > 0;
  if (isReprint) requirePermission(ctx.role, "ticket:reprint");

  const pdf = await renderTicketsPdf([toRow(ticket)]);

  const printBatchRecord = await prisma.printBatch.create({
    data: {
      kind: isReprint ? "REPRINT" : "PRODUCTION",
      eventId: ticket.eventId,
      ticketId: ticket.id,
      ticketCount: 1,
      actorId: ctx.userId,
      metadata: { serial: ticket.serial, priorPrints },
    },
  });

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: isReprint ? "ticket.reprint" : "ticket.print",
    targetType: "ticket",
    targetId: ticket.id,
    eventId: ticket.eventId,
    summary: {
      serial: ticket.serial,
      printBatchId: printBatchRecord.id,
      priorPrints,
    },
  });

  return {
    pdf,
    filename: `ksp-${ticket.serial}.pdf`,
    ticketCount: 1,
    skipped: 0,
    printBatchId: printBatchRecord.id,
  };
}
