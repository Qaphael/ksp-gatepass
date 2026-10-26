import type { Role } from "@/generated/prisma/client";

/**
 * Every server operation maps to exactly one permission. Routes must check
 * `can(role, permission)` against the authenticated user — default deny.
 * The matrix follows PRD 3.2; optional supervisor/seller privileges are NOT
 * granted by default and require an explicit grant mechanism (future phase).
 */
export const PERMISSIONS = [
  "dashboard:view",
  // Events
  "event:read",
  "event:create",
  "event:update",
  "event:open-sales",
  "event:close-sales",
  "event:open-admission",
  "event:close-admission",
  "event:complete",
  "event:archive",
  // Ticket categories
  "ticket-type:read",
  "ticket-type:manage",
  // Team
  "user:read",
  "user:manage",
  // Ticket inventory (Phase 2)
  "inventory:generate",
  "ticket:print",
  "ticket:reprint",
  "ticket:revoke",
  // Sales and payments (Phase 3)
  "sale:create",
  "sale:read-own",
  "sale:read-all",
  "payment:record",
  "payment:reverse",
  // Admission (Phase 4)
  "checkin:verify",
  "checkin:confirm",
  "checkin:override",
  // Reporting and audit (Phase 5)
  "report:view-summary",
  "report:export-own",
  "report:export-full",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ADMIN_ALL: readonly Permission[] = PERMISSIONS;

const SELLER: readonly Permission[] = [
  "dashboard:view",
  "event:read",
  "ticket-type:read",
  "sale:create",
  "sale:read-own",
  "payment:record",
  "ticket:print",
  "ticket:reprint",
  "report:export-own",
];

const VERIFIER: readonly Permission[] = [
  "dashboard:view",
  "event:read",
  "checkin:verify",
  "checkin:confirm",
];

const SUPERVISOR: readonly Permission[] = [
  "dashboard:view",
  "event:read",
  "ticket-type:read",
  "checkin:verify",
  "checkin:confirm",
  "report:view-summary",
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ADMIN_ALL,
  SELLER: SELLER,
  VERIFIER: VERIFIER,
  SUPERVISOR: SUPERVISOR,
};

const ROLE_PERMISSION_SETS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(ROLE_PERMISSIONS.ADMIN),
  SELLER: new Set(ROLE_PERMISSIONS.SELLER),
  VERIFIER: new Set(ROLE_PERMISSIONS.VERIFIER),
  SUPERVISOR: new Set(ROLE_PERMISSIONS.SUPERVISOR),
};

/** Default-deny permission check against the server-side role. */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSION_SETS[role]?.has(permission) ?? false;
}

export function permissionsForRole(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}
