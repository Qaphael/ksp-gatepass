import type { Event, EventStatus } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { localToUtc, utcToLocal } from "@/lib/time";
import {
  createEventSchema,
  type CreateEventInput,
  type UpdateEventInput,
} from "@/lib/validation/events";
import { conflict, notFound, requirePermission } from "./errors";

export interface EventDto {
  id: string;
  name: string;
  description: string | null;
  venue: string;
  address: string | null;
  timezone: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  /** Sum of ticket-category allocation limits (null limits counted at sale time). */
  allocatedCapacity: number;
  ticketTypeCount: number;
  salesOpensAtLocal: string | null;
  salesClosesAtLocal: string | null;
  admissionOpensAtLocal: string | null;
  admissionClosesAtLocal: string | null;
  salesOpen: boolean;
  admissionOpen: boolean;
  status: EventStatus;
  admissionPolicy: string;
  accentColor: string | null;
  ticketFooterText: string | null;
  organiserContact: string | null;
  createdAt: string;
  updatedAt: string;
}

async function allocatedCapacityOf(eventId: string): Promise<number> {
  const agg = await prisma.ticketType.aggregate({
    where: { eventId },
    _sum: { allocationLimit: true },
  });
  return agg._sum.allocationLimit ?? 0;
}

async function toEventDto(event: Event): Promise<EventDto> {
  const [allocatedCapacity, ticketTypeCount] = await Promise.all([
    allocatedCapacityOf(event.id),
    prisma.ticketType.count({ where: { eventId: event.id } }),
  ]);
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    venue: event.venue,
    address: event.address,
    timezone: event.timezone,
    eventDate: event.eventDate.toISOString().slice(0, 10),
    startTime: event.startTime,
    endTime: event.endTime,
    capacity: event.capacity,
    allocatedCapacity,
    ticketTypeCount,
    salesOpensAtLocal: event.salesOpensAt
      ? utcToLocal(event.salesOpensAt, event.timezone)
      : null,
    salesClosesAtLocal: event.salesClosesAt
      ? utcToLocal(event.salesClosesAt, event.timezone)
      : null,
    admissionOpensAtLocal: event.admissionOpensAt
      ? utcToLocal(event.admissionOpensAt, event.timezone)
      : null,
    admissionClosesAtLocal: event.admissionClosesAt
      ? utcToLocal(event.admissionClosesAt, event.timezone)
      : null,
    salesOpen: event.salesOpen,
    admissionOpen: event.admissionOpen,
    status: event.status,
    admissionPolicy: event.admissionPolicy,
    accentColor: event.accentColor,
    ticketFooterText: event.ticketFooterText,
    organiserContact: event.organiserContact,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

async function findEventOr404(id: string): Promise<Event> {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw notFound("Event not found.");
  return event;
}

function assertEditable(event: Event): void {
  if (event.status === "COMPLETED" || event.status === "ARCHIVED") {
    throw conflict("Completed or archived events cannot be edited.");
  }
}

export async function listEvents(ctx: AuthContext): Promise<EventDto[]> {
  requirePermission(ctx.role, "event:read");
  const events = await prisma.event.findMany({ orderBy: { eventDate: "desc" } });
  return Promise.all(events.map(toEventDto));
}

export async function getEvent(ctx: AuthContext, id: string): Promise<EventDto> {
  requirePermission(ctx.role, "event:read");
  return toEventDto(await findEventOr404(id));
}

export async function createEvent(
  ctx: AuthContext,
  input: CreateEventInput,
): Promise<EventDto> {
  requirePermission(ctx.role, "event:create");

  const event = await prisma.event.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      venue: input.venue,
      address: input.address ?? null,
      timezone: input.timezone,
      eventDate: new Date(`${input.eventDate}T00:00:00Z`),
      startTime: input.startTime,
      endTime: input.endTime,
      capacity: input.capacity,
      salesOpensAt: input.salesOpensAtLocal
        ? localToUtc(input.salesOpensAtLocal, input.timezone)
        : null,
      salesClosesAt: input.salesClosesAtLocal
        ? localToUtc(input.salesClosesAtLocal, input.timezone)
        : null,
      admissionOpensAt: input.admissionOpensAtLocal
        ? localToUtc(input.admissionOpensAtLocal, input.timezone)
        : null,
      admissionClosesAt: input.admissionClosesAtLocal
        ? localToUtc(input.admissionClosesAtLocal, input.timezone)
        : null,
      status: input.status,
      admissionPolicy: input.admissionPolicy,
      accentColor: input.accentColor ?? null,
      ticketFooterText: input.ticketFooterText ?? null,
      organiserContact: input.organiserContact ?? null,
      createdById: ctx.userId,
    },
  });

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "event.create",
    targetType: "event",
    targetId: event.id,
    eventId: event.id,
    summary: { name: event.name, capacity: event.capacity },
  });
  return toEventDto(event);
}

export async function updateEvent(
  ctx: AuthContext,
  id: string,
  patch: UpdateEventInput,
): Promise<EventDto> {
  requirePermission(ctx.role, "event:update");
  const existing = await findEventOr404(id);
  assertEditable(existing);

  // Rebuild the full input from stored state, apply the patch, then revalidate
  // every PRD 5.3 rule against the merged result.
  const current: CreateEventInput = {
    name: existing.name,
    description: existing.description,
    venue: existing.venue,
    address: existing.address,
    timezone: existing.timezone,
    eventDate: existing.eventDate.toISOString().slice(0, 10),
    startTime: existing.startTime,
    endTime: existing.endTime,
    capacity: existing.capacity,
    salesOpensAtLocal: existing.salesOpensAt
      ? utcToLocal(existing.salesOpensAt, existing.timezone)
      : null,
    salesClosesAtLocal: existing.salesClosesAt
      ? utcToLocal(existing.salesClosesAt, existing.timezone)
      : null,
    admissionOpensAtLocal: existing.admissionOpensAt
      ? utcToLocal(existing.admissionOpensAt, existing.timezone)
      : null,
    admissionClosesAtLocal: existing.admissionClosesAt
      ? utcToLocal(existing.admissionClosesAt, existing.timezone)
      : null,
    accentColor: existing.accentColor,
    ticketFooterText: existing.ticketFooterText,
    organiserContact: existing.organiserContact,
    // assertEditable above guarantees DRAFT/SCHEDULED here.
    status: existing.status as CreateEventInput["status"],
    admissionPolicy: existing.admissionPolicy,
  };
  const merged = { ...current, ...patch } as CreateEventInput;
  const parsed = createEventSchema.parse(merged);

  // Capacity can never drop below what ticket categories already claim.
  const allocated = await allocatedCapacityOf(existing.id);
  if (parsed.capacity < allocated) {
    throw conflict(
      "Capacity cannot be lower than the total quantity allocated across ticket categories.",
    );
  }

  const changed = (Object.keys(patch) as Array<keyof UpdateEventInput>).filter(
    (key) => patch[key] !== undefined,
  );
  const event = await prisma.event.update({
    where: { id },
    data: {
      name: parsed.name,
      description: parsed.description ?? null,
      venue: parsed.venue,
      address: parsed.address ?? null,
      timezone: parsed.timezone,
      eventDate: new Date(`${parsed.eventDate}T00:00:00Z`),
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      capacity: parsed.capacity,
      salesOpensAt: parsed.salesOpensAtLocal
        ? localToUtc(parsed.salesOpensAtLocal, parsed.timezone)
        : null,
      salesClosesAt: parsed.salesClosesAtLocal
        ? localToUtc(parsed.salesClosesAtLocal, parsed.timezone)
        : null,
      admissionOpensAt: parsed.admissionOpensAtLocal
        ? localToUtc(parsed.admissionOpensAtLocal, parsed.timezone)
        : null,
      admissionClosesAt: parsed.admissionClosesAtLocal
        ? localToUtc(parsed.admissionClosesAtLocal, parsed.timezone)
        : null,
      status: parsed.status,
      admissionPolicy: parsed.admissionPolicy,
      accentColor: parsed.accentColor ?? null,
      ticketFooterText: parsed.ticketFooterText ?? null,
      organiserContact: parsed.organiserContact ?? null,
    },
  });

  if (changed.length > 0) {
    await recordAudit({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "event.update",
      targetType: "event",
      targetId: event.id,
      eventId: event.id,
      summary: { fields: changed },
    });
  }
  return toEventDto(event);
}

/** Shared handler for the open/close sales and admission actions. */
async function setWindowOpen(
  ctx: AuthContext,
  id: string,
  window: "sales" | "admission",
  open: boolean,
): Promise<EventDto> {
  requirePermission(
    ctx.role,
    window === "sales"
      ? open
        ? "event:open-sales"
        : "event:close-sales"
      : open
        ? "event:open-admission"
        : "event:close-admission",
  );

  const event = await findEventOr404(id);
  const isOpen = window === "sales" ? event.salesOpen : event.admissionOpen;
  if (isOpen === open) return toEventDto(event); // idempotent

  if (open) {
    if (event.status === "COMPLETED" || event.status === "ARCHIVED") {
      throw conflict("Completed or archived events cannot be reopened.");
    }
    if (event.status === "DRAFT") {
      throw conflict("Publish the event before opening it.");
    }
    const opensAt = window === "sales" ? event.salesOpensAt : event.admissionOpensAt;
    const closesAt = window === "sales" ? event.salesClosesAt : event.admissionClosesAt;
    const now = Date.now();
    if (opensAt && now < opensAt.getTime()) {
      throw conflict(
        `The ${window} window has not opened yet. Adjust the configured time first.`,
      );
    }
    if (closesAt && now > closesAt.getTime()) {
      throw conflict(`The ${window} window has already closed.`);
    }
  }

  const updated = await prisma.event.update({
    where: { id },
    data: window === "sales" ? { salesOpen: open } : { admissionOpen: open },
  });
  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: `event.${window}.${open ? "open" : "close"}`,
    targetType: "event",
    targetId: event.id,
    eventId: event.id,
  });
  return toEventDto(updated);
}

export function openSales(ctx: AuthContext, id: string): Promise<EventDto> {
  return setWindowOpen(ctx, id, "sales", true);
}

export function closeSales(ctx: AuthContext, id: string): Promise<EventDto> {
  return setWindowOpen(ctx, id, "sales", false);
}

export function openAdmission(ctx: AuthContext, id: string): Promise<EventDto> {
  return setWindowOpen(ctx, id, "admission", true);
}

export function closeAdmission(ctx: AuthContext, id: string): Promise<EventDto> {
  return setWindowOpen(ctx, id, "admission", false);
}

export async function completeEvent(ctx: AuthContext, id: string): Promise<EventDto> {
  requirePermission(ctx.role, "event:complete");
  const event = await findEventOr404(id);
  if (event.status === "COMPLETED") return toEventDto(event); // idempotent
  if (event.status === "ARCHIVED") {
    throw conflict("Archived events cannot be completed.");
  }

  const updated = await prisma.event.update({
    where: { id },
    data: { status: "COMPLETED", salesOpen: false, admissionOpen: false },
  });
  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "event.complete",
    targetType: "event",
    targetId: event.id,
    eventId: event.id,
  });
  return toEventDto(updated);
}

export async function archiveEvent(ctx: AuthContext, id: string): Promise<EventDto> {
  requirePermission(ctx.role, "event:archive");
  const event = await findEventOr404(id);
  if (event.status === "ARCHIVED") return toEventDto(event); // idempotent

  const updated = await prisma.event.update({
    where: { id },
    data: { status: "ARCHIVED", salesOpen: false, admissionOpen: false },
  });
  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "event.archive",
    targetType: "event",
    targetId: event.id,
    eventId: event.id,
  });
  return toEventDto(updated);
}
