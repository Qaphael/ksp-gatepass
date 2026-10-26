import { randomBytes, randomUUID } from "node:crypto";
import type { TicketBatch, TicketStatus } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { generateQrToken, hashQrToken } from "@/lib/qr/tokens";
import { encryptToken } from "@/lib/qr/token-vault";
import { formatSerial, SERIAL_NUMBER_MAX } from "@/lib/serial";
import type { GenerateBatchInput } from "@/lib/validation/tickets";
import { conflict, notFound, requirePermission } from "./errors";

/**
 * Transactional ticket-batch generation (PRD 5.5, 6.2, 7.5 rules 4/6/14).
 *
 * Concurrency: the event row is locked with `SELECT … FOR UPDATE` first, so
 * two simultaneous batches for the same event are serialised and the capacity
 * re-check always sees the other batch's committed tickets. Uniqueness of
 * `serial` and `tokenHash` is additionally guaranteed by the database — if a
 * duplicate slips through, the whole transaction rolls back (no partial
 * batch, PRD 6.2 failure handling).
 */

export interface TicketBatchDto {
  id: string;
  batchRef: string;
  eventId: string;
  eventName: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  serialPrefix: string;
  serialStart: number;
  serialEnd: number;
  /** Human-readable range, e.g. `KSP-00001 … KSP-00500`. */
  serialRange: string;
  label: string | null;
  createdById: string | null;
  createdAt: string;
}

function toDto(batch: TicketBatch & {
  event: { name: string };
  ticketType: { name: string };
}): TicketBatchDto {
  return {
    id: batch.id,
    batchRef: batch.batchRef,
    eventId: batch.eventId,
    eventName: batch.event.name,
    ticketTypeId: batch.ticketTypeId,
    ticketTypeName: batch.ticketType.name,
    quantity: batch.quantity,
    serialPrefix: batch.serialPrefix,
    serialStart: batch.serialStart,
    serialEnd: batch.serialEnd,
    serialRange: `${formatSerial(batch.serialPrefix, batch.serialStart)} … ${formatSerial(
      batch.serialPrefix,
      batch.serialEnd,
    )}`,
    label: batch.label,
    createdById: batch.createdById,
    createdAt: batch.createdAt.toISOString(),
  };
}

const DTO_INCLUDE = {
  event: { select: { name: true } },
  ticketType: { select: { name: true } },
} as const;

/** Statuses that do NOT consume capacity: cancelled/revoked stock is released. */
const CAPACITY_COUNTING_STATUS: { notIn: TicketStatus[] } = {
  notIn: ["CANCELLED", "REVOKED"],
};

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/** `BATCH-<10 hex>` — short, URL-safe, traceable. */
function newBatchRef(): string {
  return `BATCH-${randomBytes(5).toString("hex")}`;
}

async function createBatchRefSafe(): Promise<string> {
  // Hex collisions are astronomically unlikely; retry a few times anyway so a
  // clash can never surface as a 500 to the operator.
  for (let attempt = 0; attempt < 5; attempt++) {
    const batchRef = newBatchRef();
    const clash = await prisma.ticketBatch.findUnique({ where: { batchRef } });
    if (!clash) return batchRef;
  }
  throw conflict("Could not allocate a batch reference. Please try again.");
}

export interface GenerateBatchResult {
  batch: TicketBatchDto;
  /** False when an idempotent retry returned the previously created batch. */
  created: boolean;
}

export async function generateBatch(
  ctx: AuthContext,
  input: GenerateBatchInput,
  idempotencyKey: string | null,
): Promise<GenerateBatchResult> {
  requirePermission(ctx.role, "inventory:generate");

  if (idempotencyKey) {
    const existing = await prisma.ticketBatch.findUnique({
      where: { idempotencyKey },
      include: DTO_INCLUDE,
    });
    if (existing) return { batch: toDto(existing), created: false };
  }

  const batchRef = await createBatchRefSafe();

  try {
    const batch = await prisma.$transaction(
      async (tx) => {
        // 1. Lock the event: serialises concurrent generators (rule 6).
        const locked = await tx.$queryRaw<Array<{ id: string; status: string; capacity: number }>>`
          SELECT id, status, capacity FROM "Event" WHERE id = ${input.eventId} FOR UPDATE`;
        const event = locked[0];
        if (!event) throw notFound("Event not found.");
        if (event.status === "COMPLETED" || event.status === "ARCHIVED") {
          throw conflict("Completed or archived events cannot generate tickets.");
        }

        // 2. Category must exist, belong to this event and be usable.
        const ticketType = await tx.ticketType.findUnique({
          where: { id: input.ticketTypeId },
        });
        if (!ticketType || ticketType.eventId !== event.id) {
          throw notFound("Ticket category not found.");
        }
        if (ticketType.status !== "ACTIVE") {
          throw conflict("Inactive ticket categories cannot be generated.");
        }

        // 3. Serial range. Omitted start = next free number for this prefix.
        let serialStart: number;
        if (input.serialStart === undefined) {
          const last = await tx.ticketBatch.aggregate({
            where: { serialPrefix: input.serialPrefix },
            _max: { serialEnd: true },
          });
          serialStart = (last._max.serialEnd ?? 0) + 1;
        } else {
          serialStart = input.serialStart;
        }
        const serialEnd = serialStart + input.quantity - 1;
        if (serialEnd > SERIAL_NUMBER_MAX) {
          throw conflict("That request would exceed the maximum serial number.");
        }

        // 4. Capacity: event total and per-category allocation (rule 6).
        const eventUsed = await tx.ticket.count({
          where: { eventId: event.id, status: CAPACITY_COUNTING_STATUS },
        });
        const eventRemaining = event.capacity - eventUsed;
        if (input.quantity > eventRemaining) {
          throw conflict(
            `Only ${eventRemaining} of ${event.capacity} event capacity remains for new tickets.`,
          );
        }
        if (ticketType.allocationLimit !== null) {
          const typeUsed = await tx.ticket.count({
            where: { ticketTypeId: ticketType.id, status: CAPACITY_COUNTING_STATUS },
          });
          const typeRemaining = ticketType.allocationLimit - typeUsed;
          if (input.quantity > typeRemaining) {
            throw conflict(
              `Only ${typeRemaining} of ${ticketType.allocationLimit} remain in “${ticketType.name}”.`,
            );
          }
        }

        // 5. Create the batch header, then every ticket, in this transaction.
        const createdBatch = await tx.ticketBatch.create({
          data: {
            batchRef,
            eventId: event.id,
            ticketTypeId: ticketType.id,
            quantity: input.quantity,
            serialPrefix: input.serialPrefix,
            serialStart,
            serialEnd,
            label: input.label ?? null,
            idempotencyKey,
            createdById: ctx.userId,
          },
        });

        // Explicit ids/timestamps keep createMany independent of client-side
        // default generation. Chunked well under PostgreSQL's parameter limit.
        const rows = Array.from({ length: input.quantity }, (_, i) => {
          const token = generateQrToken();
          return {
            id: randomUUID(),
            eventId: event.id,
            ticketTypeId: ticketType.id,
            batchId: createdBatch.id,
            serial: formatSerial(input.serialPrefix, serialStart + i),
            tokenHash: hashQrToken(token),
            tokenEnc: encryptToken(token),
            updatedAt: new Date(),
          };
        });
        const CHUNK = 500;
        for (let offset = 0; offset < rows.length; offset += CHUNK) {
          await tx.ticket.createMany({ data: rows.slice(offset, offset + CHUNK) });
        }

        return createdBatch;
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    // Audit AFTER commit: safe summary only — never tokens or hashes (rule 6).
    await recordAudit({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "ticket-batch.create",
      targetType: "ticket-batch",
      targetId: batch.id,
      eventId: batch.eventId,
      summary: {
        batchRef: batch.batchRef,
        quantity: batch.quantity,
        serialRange: `${formatSerial(batch.serialPrefix, batch.serialStart)} … ${formatSerial(batch.serialPrefix, batch.serialEnd)}`,
        ticketTypeId: batch.ticketTypeId,
        label: batch.label,
      },
    });

    const full = await prisma.ticketBatch.findUniqueOrThrow({
      where: { id: batch.id },
      include: DTO_INCLUDE,
    });
    return { batch: toDto(full), created: true };
  } catch (error) {
    // Concurrent retry with the same Idempotency-Key: the loser's transaction
    // aborts on the unique key — return the winner's batch (rule 8/12).
    if (isUniqueViolation(error) && idempotencyKey) {
      const existing = await prisma.ticketBatch.findUnique({
        where: { idempotencyKey },
        include: DTO_INCLUDE,
      });
      if (existing) return { batch: toDto(existing), created: false };
    }
    if (isUniqueViolation(error)) {
      throw conflict(
        "A serial number in that range already exists. Choose a different starting number.",
      );
    }
    throw error;
  }
}

export async function getBatch(ctx: AuthContext, id: string): Promise<TicketBatchDto> {
  requirePermission(ctx.role, "inventory:read");
  const batch = await prisma.ticketBatch.findUnique({
    where: { id },
    include: DTO_INCLUDE,
  });
  if (!batch) throw notFound("Batch not found.");
  return toDto(batch);
}

export async function listBatches(ctx: AuthContext, eventId: string): Promise<TicketBatchDto[]> {
  requirePermission(ctx.role, "inventory:read");
  const batches = await prisma.ticketBatch.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    include: DTO_INCLUDE,
  });
  return batches.map(toDto);
}
