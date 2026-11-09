import type { Prisma, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";

const UGANDA_PHONE = /(?:\+?256[\s().-]*7\d{2}(?:[\s().-]*\d{3}){2}|(?<!\w)07\d{2}(?:[\s().-]*\d{3}){2}(?!\d))/g;

/** Scrub Uganda mobile numbers before audit data is stored or returned. */
export function sanitizeAuditData(value: unknown): unknown {
  if (typeof value === "string") return value.replace(UGANDA_PHONE, "[REDACTED PHONE]");
  if (Array.isArray(value)) return value.map(sanitizeAuditData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeAuditData(child)]));
  }
  return value;
}

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
      summary: sanitizeAuditData(entry.summary ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
