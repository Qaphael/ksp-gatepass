import { beforeAll, describe, expect, it } from "vitest";
import {
  TestClient,
  loginAs,
  unique,
  uniqueIp,
  type JsonResult,
} from "../helpers/client";

/**
 * RBAC must be enforced on the server for every direct API call. Hiding a
 * button in the UI is never enough (AGENTS rule 9 / PRD 3.2).
 */

let admin: TestClient;
let seller: TestClient;
let verifier: TestClient;
let supervisor: TestClient;
let eventId: string;

function json(
  client: TestClient,
  method: string,
  path: string,
  body?: unknown,
): Promise<JsonResult> {
  return client.json(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

const validEventPayload = () => ({
  name: unique("Permission Event"),
  venue: "KSP Hotel Gulu",
  eventDate: "2026-12-05",
  startTime: "18:00",
  endTime: "23:00",
  capacity: 100,
});

beforeAll(async () => {
  admin = await loginAs("admin");
  seller = await loginAs("seller");
  verifier = await loginAs("verifier");
  supervisor = await loginAs("supervisor");

  const created = await admin.post("/api/v1/events", validEventPayload());
  expect(created.status).toBe(201);
  eventId = created.body.event.id;
});

describe("unauthenticated requests", () => {
  it("are rejected with 401 on every route", async () => {
    const anon = new TestClient(uniqueIp());
    const requests: Array<[string, string, unknown?]> = [
      ["GET", "/api/v1/auth/me"],
      ["POST", "/api/v1/auth/logout"],
      ["POST", "/api/v1/auth/change-password", {}],
      ["GET", "/api/v1/events"],
      ["POST", "/api/v1/events", validEventPayload()],
      ["GET", `/api/v1/events/${eventId}`],
      ["PATCH", `/api/v1/events/${eventId}`, { name: "Renamed" }],
      ["POST", `/api/v1/events/${eventId}/open-sales`],
      ["POST", `/api/v1/events/${eventId}/complete`],
      ["GET", `/api/v1/events/${eventId}/ticket-types`],
      ["POST", `/api/v1/events/${eventId}/ticket-types`, { name: "V", priceUgx: 5000 }],
      ["GET", "/api/v1/users"],
      ["POST", "/api/v1/users", { displayName: "X", username: "anonuser01", role: "SELLER", password: "long-enough-pass" }],
      ["PATCH", "/api/v1/users/some-user-id", { role: "ADMIN" }],
      ["POST", "/api/v1/users/some-user-id/deactivate"],
    ];

    for (const [method, path, body] of requests) {
      const result = await json(anon, method, path, body);
      expect(result.status, `${method} ${path}`).toBe(401);
      expect(result.body.error?.code, `${method} ${path}`).toBe("UNAUTHENTICATED");
    }
  });
});

describe("verifier", () => {
  it("is denied every write and team operation with 403", async () => {
    const denied: Array<[string, string, unknown?]> = [
      ["POST", "/api/v1/events", validEventPayload()],
      ["PATCH", `/api/v1/events/${eventId}`, { name: "Renamed" }],
      ["POST", `/api/v1/events/${eventId}/open-sales`],
      ["POST", `/api/v1/events/${eventId}/close-sales`],
      ["POST", `/api/v1/events/${eventId}/open-admission`],
      ["POST", `/api/v1/events/${eventId}/close-admission`],
      ["POST", `/api/v1/events/${eventId}/complete`],
      ["POST", `/api/v1/events/${eventId}/archive`],
      ["POST", `/api/v1/events/${eventId}/ticket-types`, { name: "VIP", priceUgx: 50000 }],
      ["GET", "/api/v1/users"],
      ["POST", "/api/v1/users", { displayName: "X", username: "verifiercreates", role: "SELLER", password: "long-enough-pass" }],
      ["PATCH", "/api/v1/users/some-user-id", { role: "ADMIN" }],
      ["POST", "/api/v1/users/some-user-id/deactivate"],
    ];

    for (const [method, path, body] of denied) {
      const result = await json(verifier, method, path, body);
      expect(result.status, `${method} ${path}`).toBe(403);
      expect(result.body.error?.code, `${method} ${path}`).toBe("FORBIDDEN");
    }

    // The denial body never leaks internals.
    const probe = await json(verifier, "POST", "/api/v1/events", validEventPayload());
    const serialized = JSON.stringify(probe.body);
    expect(serialized).not.toMatch(/stack|password|token|prisma/i);

    // Reads the verifier does have: events yes, team and categories no.
    expect((await verifier.get("/api/v1/events")).status).toBe(200);
    expect((await verifier.get(`/api/v1/events/${eventId}`)).status).toBe(200);
    expect((await verifier.get(`/api/v1/events/${eventId}/ticket-types`)).status).toBe(403);
    const me = await verifier.get("/api/v1/auth/me");
    expect(me.body.user.role).toBe("VERIFIER");
    expect(me.body.permissions).toContain("checkin:verify");
    expect(me.body.permissions).not.toContain("sale:create");
  });
});

describe("seller", () => {
  it("can read events but never manage users, events or categories", async () => {
    const denied: Array<[string, string, unknown?]> = [
      ["POST", "/api/v1/events", validEventPayload()],
      ["PATCH", `/api/v1/events/${eventId}`, { name: "Renamed" }],
      ["POST", `/api/v1/events/${eventId}/open-sales`],
      ["POST", `/api/v1/events/${eventId}/complete`],
      ["POST", `/api/v1/events/${eventId}/ticket-types`, { name: "VIP", priceUgx: 50000 }],
      ["GET", "/api/v1/users"],
      ["POST", "/api/v1/users", { displayName: "X", username: "sellercreates", role: "VERIFIER", password: "long-enough-pass" }],
      ["POST", "/api/v1/users/some-user-id/deactivate"],
    ];

    for (const [method, path, body] of denied) {
      const result = await json(seller, method, path, body);
      expect(result.status, `${method} ${path}`).toBe(403);
      expect(result.body.error?.code, `${method} ${path}`).toBe("FORBIDDEN");
    }

    expect((await seller.get("/api/v1/events")).status).toBe(200);
    // Sellers may read category prices for selling…
    expect((await seller.get(`/api/v1/events/${eventId}/ticket-types`)).status).toBe(200);
    // …but not create or edit them.
    expect(
      (await seller.patch(`/api/v1/ticket-types/some-type-id`, { priceUgx: 1 })).status,
    ).toBe(403);
  });
});

describe("supervisor", () => {
  it("gets monitoring reads but no writes without explicit grants", async () => {
    const denied: Array<[string, string, unknown?]> = [
      ["POST", "/api/v1/events", validEventPayload()],
      ["PATCH", `/api/v1/events/${eventId}`, { name: "Renamed" }],
      ["POST", `/api/v1/events/${eventId}/open-sales`],
      ["POST", `/api/v1/events/${eventId}/complete`],
      ["POST", `/api/v1/events/${eventId}/ticket-types`, { name: "VIP", priceUgx: 50000 }],
      ["GET", "/api/v1/users"],
      ["POST", "/api/v1/users", { displayName: "X", username: "supervisorcreates", role: "VERIFIER", password: "long-enough-pass" }],
    ];

    for (const [method, path, body] of denied) {
      const result = await json(supervisor, method, path, body);
      expect(result.status, `${method} ${path}`).toBe(403);
    }

    // Optional privileges (audit, payment reversal, override) are NOT default.
    const me = await supervisor.get("/api/v1/auth/me");
    expect(me.body.permissions).toContain("report:view-summary");
    expect(me.body.permissions).not.toContain("audit:read");
    expect(me.body.permissions).not.toContain("payment:record");
    expect(me.body.permissions).not.toContain("checkin:override");
    expect((await supervisor.get(`/api/v1/events/${eventId}/ticket-types`)).status).toBe(200);
  });
});

describe("admin", () => {
  it("can read and create users without ever exposing password hashes", async () => {
    const list = await admin.get("/api/v1/users");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.users)).toBe(true);
    expect(list.body.users.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(list.body)).not.toContain("passwordHash");

    const created = await admin.post("/api/v1/users", {
      displayName: unique("Team Member"),
      username: unique("member"),
      role: "SELLER",
      password: "TeamMate!Password1234",
    });
    expect(created.status).toBe(201);
    expect(created.body.user).not.toHaveProperty("passwordHash");
    expect(created.body.user.role).toBe("SELLER");

    const audit = await admin.get("/api/v1/events");
    expect(audit.status).toBe(200);
  });

  it("rejects a duplicate username with 409", async () => {
    const created = await admin.post("/api/v1/users", {
      displayName: "Duplicate Test User",
      username: unique("dupuser"),
      role: "SELLER",
      password: "Duplicate!Password1234",
    });
    expect(created.status).toBe(201);

    const duplicate = await admin.post("/api/v1/users", {
      displayName: "Duplicate Again",
      username: created.body.user.username,
      role: "VERIFIER",
      password: "Duplicate!Password1234",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("CONFLICT");
  });

  it("cannot change their own role or deactivate themselves", async () => {
    const me = await admin.get("/api/v1/auth/me");
    const ownId = me.body.user.id;

    const roleChange = await admin.patch(`/api/v1/users/${ownId}`, {
      role: "VERIFIER",
    });
    expect(roleChange.status).toBe(422);
    expect(roleChange.body.error.code).toBe("VALIDATION_ERROR");

    const stillAdmin = await admin.get("/api/v1/auth/me");
    expect(stillAdmin.body.user.role).toBe("ADMIN");

    const selfDeactivate = await admin.post(`/api/v1/users/${ownId}/deactivate`);
    expect(selfDeactivate.status).toBe(422);
    expect((await admin.get("/api/v1/auth/me")).status).toBe(200);
  });

  it("gets 404 (not 500) for unknown resources", async () => {
    const event = await admin.get(
      "/api/v1/events/00000000-0000-0000-0000-000000000000",
    );
    expect(event.status).toBe(404);
    expect(event.body.error.code).toBe("NOT_FOUND");

    const user = await admin.patch("/api/v1/users/00000000-0000-0000-0000-000000000000", {
      displayName: "Ghost",
    });
    expect(user.status).toBe(404);
    expect(user.body.error.code).toBe("NOT_FOUND");
  });
});
