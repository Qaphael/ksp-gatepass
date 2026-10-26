import type { Prisma, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";

export type AuditOutcomeValue = "SUCCESS" | "FAILURE";

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: Role | null;
  /** Stable dotted code, e.g. "auth.login.success", "user.role.change". */
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  eventId?: string | null;
  outcome?: AuditOutcomeValue;
  /**
   * Safe change summary only. Never include passwords, session tokens or raw
   * QR tokens here (business rule 6 / PRD 5.16).
   */
  summary?: Record<string, unknown> | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      eventId: entry.eventId ?? null,
      outcome: entry.outcome ?? "SUCCESS",
      summary: (entry.summary ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
