import { beforeAll, describe, expect, it } from "vitest";
import { loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";

/**
 * Ticket categories (PRD 5.4): integer UGX prices, unique names per event,
 * quantities that can never exceed event capacity, and DB-level CHECK
 * constraints as the last line of defence.
 */

let admin: TestClient;
let supervisor: TestClient;
let eventId: string;
let regularId: string;

beforeAll(async () => {
  admin = await loginAs("admin");
  supervisor = await loginAs("supervisor");

  const event = await admin.post("/api/v1/events", {
    name: unique("Capacity Event"),
    venue: "KSP Hotel Gulu",
    eventDate: "2026-12-05",
    startTime: "18:00",
    endTime: "23:00",
    capacity: 60,
  });
  expect(event.status).toBe(201);
  eventId = event.body.event.id;
});

describe("category creation", () => {
  it("creates a category with integer UGX pricing and defaults", async () => {
    const result = await admin.post(`/api/v1/events/${eventId}/ticket-types`, {
      name: "Regular",
      priceUgx: 25_000,
      allocationLimit: 50,
    });
    expect(result.status).toBe(201);

    const ticketType = result.body.ticketType;
    regularId = ticketType.id;
    expect(ticketType.priceUgx).toBe(25_000);
    expect(ticketType.allocationLimit).toBe(50);
    expect(ticketType.permitsAdmission).toBe(true);
    expect(ticketType.status).toBe("ACTIVE");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "ticket-type.create", targetId: regularId },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects a duplicate category name with 409", async () => {
    const duplicate = await admin.post(
      `/api/v1/events/${eventId}/ticket-types`,
      { name: "Regular", priceUgx: 30_000 },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("CONFLICT");
  });

  it("rejects invalid prices and quantities with 422", async () => {
    const negative = await admin.post(
      `/api/v1/events/${eventId}/ticket-types`,
      { name: "Negative", priceUgx: -1 },
    );
    expect(negative.status).toBe(422);

    const fractional = await admin.post(
      `/api/v1/events/${eventId}/ticket-types`,
      { name: "Fractional", priceUgx: 1000, allocationLimit: 10.5 },
    );
    expect(fractional.status).toBe(422);
  });
});

describe("capacity rules", () => {
  it("never lets category quantities exceed event capacity (50+10=60 ok, +20 blocked)", async () => {
    const overflow = await admin.post(
      `/api/v1/events/${eventId}/ticket-types`,
      { name: "Overflow", priceUgx: 1000, allocationLimit: 20 },
    );
    expect(overflow.status).toBe(409);
    expect(overflow.body.error.code).toBe("CONFLICT");

    const boundary = await admin.post(
      `/api/v1/events/${eventId}/ticket-types`,
      { name: "VIP", priceUgx: 100_000, allocationLimit: 10 },
    );
    expect(boundary.status).toBe(201); // exactly at capacity is allowed

    const list = await admin.get(`/api/v1/events/${eventId}/ticket-types`);
    expect(list.status).toBe(200);
    expect(list.body.ticketTypes).toHaveLength(2);
    expect(list.body.ticketTypes[0].name).toBe("Regular");
  });

  it("rejects an update that would overflow capacity", async () => {
    const vip = (
      await admin.get(`/api/v1/events/${eventId}/ticket-types`)
    ).body.ticketTypes.find((type: { name: string }) => type.name === "VIP");

    const overflow = await admin.patch(`/api/v1/ticket-types/${vip.id}`, {
      allocationLimit: 11,
    });
    expect(overflow.status).toBe(409);

    const priceChange = await admin.patch(`/api/v1/ticket-types/${vip.id}`, {
      priceUgx: 120_000,
    });
    expect(priceChange.status).toBe(200);
    expect(priceChange.body.ticketType.priceUgx).toBe(120_000);
  });

  it("refuses to shrink event capacity below allocated quantities", async () => {
    const shrink = await admin.patch(`/api/v1/events/${eventId}`, {
      capacity: 40,
    });
    expect(shrink.status).toBe(409);
    expect(shrink.body.error.code).toBe("CONFLICT");

    const stillSixty = await admin.get(`/api/v1/events/${eventId}`);
    expect(stillSixty.body.event.capacity).toBe(60);
    expect(stillSixty.body.event.allocatedCapacity).toBe(60);
  });

  it("enforces price constraints at the database level too", async () => {
    // Bypasses Zod and the service on purpose: the CHECK constraint must hold.
    await expect(
      prisma.ticketType.create({
        data: { eventId, name: "Db Negative", priceUgx: -1 },
      }),
    ).rejects.toThrow();

    const rows = await prisma.ticketType.count({
      where: { eventId, name: "Db Negative" },
    });
    expect(rows).toBe(0);
  });
});

describe("read-only rules and access", () => {
  it("answers 404 for an unknown event", async () => {
    const result = await admin.get(
      "/api/v1/events/00000000-0000-0000-0000-000000000000/ticket-types",
    );
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("lets supervisors read but never manage categories", async () => {
    const read = await supervisor.get(`/api/v1/events/${eventId}/ticket-types`);
    expect(read.status).toBe(200);

    const write = await supervisor.post(
      `/api/v1/events/${eventId}/ticket-types`,
      { name: "Supervisor Try", priceUgx: 1000 },
    );
    expect(write.status).toBe(403);
  });

  it("locks a completed event against category changes", async () => {
    const complete = await admin.post(`/api/v1/events/${eventId}/complete`);
    expect(complete.status).toBe(200);

    const create = await admin.post(
      `/api/v1/events/${eventId}/ticket-types`,
      { name: "Late Category", priceUgx: 1000 },
    );
    expect(create.status).toBe(409);

    const update = await admin.patch(`/api/v1/ticket-types/${regularId}`, {
      priceUgx: 1,
    });
    expect(update.status).toBe(409);
  });
});
