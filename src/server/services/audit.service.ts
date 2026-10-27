import type { AuthContext } from "@/lib/auth/session";
import { localToUtc } from "@/lib/time";
import { prisma } from "@/lib/db/client";
import type { AuditLogQuery } from "@/lib/validation/reports";
import { notFound, requirePermission } from "./errors";

export async function listAuditLogs(ctx: AuthContext, query: AuditLogQuery) {
  requirePermission(ctx.role, "audit:read");
  requirePermission(ctx.role, "event:read");
  if (query.eventId && !await prisma.event.findUnique({ where: { id: query.eventId }, select: { id: true } })) throw notFound("Event not found.");
  const where = {
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.action ? { action: { contains: query.action, mode: "insensitive" as const } } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.q ? { OR: [
      { action: { contains: query.q, mode: "insensitive" as const } },
      { targetType: { contains: query.q, mode: "insensitive" as const } },
      { targetId: { contains: query.q, mode: "insensitive" as const } },
    ] } : {}),
    ...(query.from || query.to ? { createdAt: {
      ...(query.from ? { gte: localToUtc(`${query.from}T00:00`, "Africa/Kampala") } : {}),
      ...(query.to ? { lt: localToUtc(`${new Date(Date.parse(`${query.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T00:00`, "Africa/Kampala") } : {}),
    } } : {}),
  };
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      select: { id: true, actorId: true, actorRole: true, action: true, targetType: true, targetId: true, eventId: true, event: { select: { name: true } }, outcome: true, summary: true, createdAt: true },
    }),
  ]);
  const ids = [...new Set(logs.map((entry) => entry.actorId).filter((id): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, username: true } });
  const actors = new Map(users.map((user) => [user.id, { displayName: user.displayName, username: user.username }]));
  return {
    logs: logs.map((entry) => ({
      id: entry.id, actorId: entry.actorId, actorRole: entry.actorRole,
      actor: entry.actorId ? actors.get(entry.actorId) ?? null : null,
      action: entry.action, targetType: entry.targetType, targetId: entry.targetId,
      eventId: entry.eventId, eventName: entry.event?.name ?? null, outcome: entry.outcome,
      summary: entry.summary, createdAt: entry.createdAt.toISOString(),
    })),
    total, page: query.page, pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
