import type { Event, TicketType } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { localToUtc, utcToLocal } from "@/lib/time";
import {
  createTicketTypeSchema,
  type CreateTicketTypeInput,
  type UpdateTicketTypeInput,
} from "@/lib/validation/ticket-types";
import { conflict, notFound, requirePermission } from "./errors";

export interface TicketTypeDto {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  priceUgx: number;
  allocationLimit: number | null;
  salesOpensAtLocal: string | null;
  salesClosesAtLocal: string | null;
  permitsAdmission: boolean;
  status: string;
  printLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

function toTicketTypeDto(type: TicketType, timezone: string): TicketTypeDto {
  return {
    id: type.id,
    eventId: type.eventId,
    name: type.name,
    description: type.description,
    priceUgx: type.priceUgx,
    allocationLimit: type.allocationLimit,
    salesOpensAtLocal: type.salesOpensAt
      ? utcToLocal(type.salesOpensAt, timezone)
      : null,
    salesClosesAtLocal: type.salesClosesAt
      ? utcToLocal(type.salesClosesAt, timezone)
      : null,
    permitsAdmission: type.permitsAdmission,
    status: type.status,
    printLabel: type.printLabel,
    createdAt: type.createdAt.toISOString(),
    updatedAt: type.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function findTicketTypeOr404(id: string): Promise<{
  ticketType: TicketType;
  event: Event;
}> {
  const ticketType = await prisma.ticketType.findUnique({ where: { id } });
  if (!ticketType) throw notFound("Ticket category not found.");
  const event = await prisma.event.findUnique({ where: { id: ticketType.eventId } });
  if (!event) throw notFound("Event not found.");
  return { ticketType, event };
}

async function findEventOr404(id: string): Promise<Event> {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw notFound("Event not found.");
  return event;
}

function assertEventEditable(event: Event): void {
  if (event.status === "COMPLETED" || event.status === "ARCHIVED") {
    throw conflict("Completed or archived events cannot be edited.");
  }
}

export async function listTicketTypes(
  ctx: AuthContext,
  eventId: string,
): Promise<TicketTypeDto[]> {
  requirePermission(ctx.role, "ticket-type:read");
  const event = await findEventOr404(eventId);
  const types = await prisma.ticketType.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
  });
  return types.map((type) => toTicketTypeDto(type, event.timezone));
}

export async function createTicketType(
  ctx: AuthContext,
  eventId: string,
  input: CreateTicketTypeInput,
): Promise<TicketTypeDto> {
  requirePermission(ctx.role, "ticket-type:manage");
  const event = await findEventOr404(eventId);
  assertEventEditable(event);

  // PRD 5.4: category quantities together may never exceed event capacity.
  const allocated = await prisma.ticketType.aggregate({
    where: { eventId },
    _sum: { allocationLimit: true },
  });
  const alreadyAllocated = allocated._sum.allocationLimit ?? 0;
  if (alreadyAllocated + (input.allocationLimit ?? 0) > event.capacity) {
    throw conflict(
      "These quantities would exceed the event capacity. Increase capacity or reduce quantities.",
    );
  }

  let ticketType: TicketType;
  try {
    ticketType = await prisma.ticketType.create({
      data: {
        eventId,
        name: input.name,
        description: input.description ?? null,
        priceUgx: input.priceUgx,
        allocationLimit: input.allocationLimit ?? null,
        salesOpensAt: input.salesOpensAtLocal
          ? localToUtc(input.salesOpensAtLocal, event.timezone)
          : null,
        salesClosesAt: input.salesClosesAtLocal
          ? localToUtc(input.salesClosesAtLocal, event.timezone)
          : null,
        permitsAdmission: input.permitsAdmission,
        status: input.status,
        printLabel: input.printLabel ?? null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("A ticket category with that name already exists.");
    }
    throw error;
  }

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "ticket-type.create",
    targetType: "ticket-type",
    targetId: ticketType.id,
    eventId,
    summary: {
      name: ticketType.name,
      priceUgx: ticketType.priceUgx,
      allocationLimit: ticketType.allocationLimit,
    },
  });
  return toTicketTypeDto(ticketType, event.timezone);
}

export async function updateTicketType(
  ctx: AuthContext,
  id: string,
  patch: UpdateTicketTypeInput,
): Promise<TicketTypeDto> {
  requirePermission(ctx.role, "ticket-type:manage");
  const { ticketType: existing, event } = await findTicketTypeOr404(id);
  assertEventEditable(event);

  const current: CreateTicketTypeInput = {
    name: existing.name,
    description: existing.description,
    priceUgx: existing.priceUgx,
    allocationLimit: existing.allocationLimit,
    salesOpensAtLocal: existing.salesOpensAt
      ? utcToLocal(existing.salesOpensAt, event.timezone)
      : null,
    salesClosesAtLocal: existing.salesClosesAt
      ? utcToLocal(existing.salesClosesAt, event.timezone)
      : null,
    permitsAdmission: existing.permitsAdmission,
    status: existing.status,
    printLabel: existing.printLabel,
  };
  const merged = { ...current, ...patch } as CreateTicketTypeInput;
  const parsed = createTicketTypeSchema.parse(merged);

  // Capacity is checked against this category's *new* limit plus all others.
  const siblings = await prisma.ticketType.aggregate({
    where: { eventId: event.id, id: { not: id } },
    _sum: { allocationLimit: true },
  });
  const siblingTotal = siblings._sum.allocationLimit ?? 0;
  if (siblingTotal + (parsed.allocationLimit ?? 0) > event.capacity) {
    throw conflict(
      "These quantities would exceed the event capacity. Increase capacity or reduce quantities.",
    );
  }

  let ticketType: TicketType;
  try {
    ticketType = await prisma.ticketType.update({
      where: { id },
      data: {
        name: parsed.name,
        description: parsed.description ?? null,
        priceUgx: parsed.priceUgx,
        allocationLimit: parsed.allocationLimit ?? null,
        salesOpensAt: parsed.salesOpensAtLocal
          ? localToUtc(parsed.salesOpensAtLocal, event.timezone)
          : null,
        salesClosesAt: parsed.salesClosesAtLocal
          ? localToUtc(parsed.salesClosesAtLocal, event.timezone)
          : null,
        permitsAdmission: parsed.permitsAdmission,
        status: parsed.status,
        printLabel: parsed.printLabel ?? null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("A ticket category with that name already exists.");
    }
    throw error;
  }

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "ticket-type.update",
    targetType: "ticket-type",
    targetId: id,
    eventId: event.id,
    summary: { name: ticketType.name, priceUgx: ticketType.priceUgx },
  });
  return toTicketTypeDto(ticketType, event.timezone);
}
