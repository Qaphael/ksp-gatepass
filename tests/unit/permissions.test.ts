import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  can,
  permissionsForRole,
  type Permission,
} from "@/lib/permissions";

const ALL = PERMISSIONS as readonly string[];

describe("permissions matrix (PRD 3.2)", () => {
  it("grants administrators every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(can("ADMIN", permission), permission).toBe(true);
    }
    expect(permissionsForRole("ADMIN")).toHaveLength(PERMISSIONS.length);
  });

  it("sellers can sell and print, but never manage users or events", () => {
    const allowed: Permission[] = [
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
    for (const permission of allowed) {
      expect(can("SELLER", permission), permission).toBe(true);
    }
    const denied: Permission[] = [
      "user:read",
      "user:manage",
      "event:create",
      "event:update",
      "event:open-sales",
      "inventory:generate",
      "ticket:revoke",
      "sale:read-all",
      "payment:reverse",
      "checkin:confirm",
      "checkin:override",
      "report:export-full",
      "report:view-summary",
      "audit:read",
    ];
    for (const permission of denied) {
      expect(can("SELLER", permission), permission).toBe(false);
    }
  });

  it("verifiers can only verify and confirm check-ins", () => {
    const allowed: Permission[] = [
      "dashboard:view",
      "event:read",
      "checkin:verify",
      "checkin:confirm",
    ];
    for (const permission of allowed) {
      expect(can("VERIFIER", permission), permission).toBe(true);
    }
    const denied: Permission[] = [
      "sale:create",
      "payment:record",
      "user:read",
      "user:manage",
      "event:create",
      "event:update",
      "ticket-type:manage",
      "checkin:override",
      "report:view-summary",
      "audit:read",
    ];
    for (const permission of denied) {
      expect(can("VERIFIER", permission), permission).toBe(false);
    }
  });

  it("supervisors get summaries and scanning, but no optional privileges", () => {
    const allowed: Permission[] = [
      "dashboard:view",
      "event:read",
      "ticket-type:read",
      "checkin:verify",
      "checkin:confirm",
      "report:view-summary",
    ];
    for (const permission of allowed) {
      expect(can("SUPERVISOR", permission), permission).toBe(true);
    }
    // "If explicitly granted" privileges are NOT granted by default.
    const notByDefault: Permission[] = [
      "payment:record",
      "checkin:override",
      "audit:read",
      "sale:create",
      "user:manage",
      "event:create",
    ];
    for (const permission of notByDefault) {
      expect(can("SUPERVISOR", permission), permission).toBe(false);
    }
  });

  it("denies unknown permissions for every role (default deny)", () => {
    const bogus = "event:delete" as Permission;
    for (const role of ["ADMIN", "SELLER", "VERIFIER", "SUPERVISOR"] as const) {
      expect(can(role, bogus), role).toBe(false);
    }
    expect(ALL).not.toContain("event:delete");
  });

  it("keeps permission codes stable and namespaced", () => {
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
  });
});
