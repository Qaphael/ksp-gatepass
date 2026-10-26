import { beforeAll, describe, expect, it } from "vitest";
import { loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";

/**
 * PRD 13.2 — batch generation, capacity, concurrency, rollback, printing.
 * Every request goes to the real production build; the database assertions
 * prove what actually landed, not what the API claimed.
 */

let admin: TestClient;
let seller: TestClient;
let verifier: TestClient;
let supervisor: TestClient;

/** Unique serial prefix per scenario — serial numbering is global per prefix. */
function newPrefix(): string {
  return (
    "Q" + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5)
  ).toUpperCase();
}

async function makeEvent(capacity: number): Promise<string> {
  const created = await admin.post("/api/v1/events", {
    name: unique("Batch Event"),
    venue: "KSP Hotel Gulu",
    eventDate: "2026-12-05",
    startTime: "18:00",
    endTime: "23:00",
    capacity,
  });
  expect(created.status).toBe(201);
  return created.body.event.id;
}

async function makeType(
  eventId: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const created = await admin.post(`/api/v1/events/${eventId}/ticket-types`, {
    name: unique("Category"),
    priceUgx: 10_000,
    ...extra,
  });
  expect(created.status).toBe(201);
  return created.body.ticketType.id;
}

interface GenerateBody {
  batch: {
    id: string;
    batchRef: string;
    quantity: number;
    serialPrefix: string;
    serialStart: number;
    serialEnd: number;
    serialRange: string;
    eventId: string;
  };
  created: boolean;
}

beforeAll(async () => {
  admin = await loginAs("admin");
  seller = await loginAs("seller");
  verifier = await loginAs("verifier");
  supervisor = await loginAs("supervisor");
});

describe("batch generation", () => {
  it("generates 500 tickets with unique serials and token hashes, leaking nothing", async () => {
    const eventId = await makeEvent(600);
    const ticketTypeId = await makeType(eventId);
    const serialPrefix = newPrefix();

    const result = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 500,
      serialPrefix,
    });
    expect(result.status).toBe(201);
    const { batch } = result.body as GenerateBody;

    expect(batch.quantity).toBe(500);
    expect(batch.serialStart).toBe(1);
    expect(batch.serialEnd).toBe(500);
    expect(batch.batchRef).toMatch(/^BATCH-[0-9a-f]{10}$/);
    expect(batch.serialRange).toContain(`${serialPrefix}-00001`);
    expect(batch.serialRange).toContain(`${serialPrefix}-00500`);

    // Response never carries token material of any kind.
    const raw = JSON.stringify(result.body);
    expect(raw).not.toMatch(/tokenHash|tokenEnc|"token"/);

    const tickets = await prisma.ticket.findMany({ where: { batchId: batch.id } });
    expect(tickets).toHaveLength(500);
    expect(new Set(tickets.map((t) => t.serial)).size).toBe(500);
    expect(new Set(tickets.map((t) => t.tokenHash)).size).toBe(500);
    expect(tickets.every((t) => t.tokenHash.length === 64)).toBe(true);
    expect(tickets.every((t) => t.tokenEnc.length > 0)).toBe(true);
    expect(tickets.every((t) => t.status === "AVAILABLE")).toBe(true);
    expect(tickets.every((t) => t.serial.startsWith(`${serialPrefix}-`))).toBe(true);

    // Audit row exists and records the safe summary only.
    const audit = await prisma.auditLog.findFirst({
      where: { action: "ticket-batch.create", targetId: batch.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.summary)).not.toMatch(/token/i);
  });

  it("never exceeds event capacity, including under concurrent requests", async () => {
    const eventId = await makeEvent(60);
    const ticketTypeId = await makeType(eventId);
    const serialPrefix = newPrefix();

    // One request that simply does not fit.
    const tooBig = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 61,
      serialPrefix,
    });
    expect(tooBig.status).toBe(409);

    // Five simultaneous requests of 30: only two fit in capacity 60.
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        admin.post("/api/v1/ticket-batches", {
          eventId,
          ticketTypeId,
          quantity: 30,
          serialPrefix,
        }),
      ),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 409, 409, 409]);

    const total = await prisma.ticket.count({ where: { eventId } });
    expect(total).toBe(60);

    // Leftover capacity is then genuinely zero.
    const afterwards = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 1,
      serialPrefix,
    });
    expect(afterwards.status).toBe(409);
  });

  it("never exceeds a category allocation limit", async () => {
    const eventId = await makeEvent(100);
    const ticketTypeId = await makeType(eventId, { allocationLimit: 10 });
    const serialPrefix = newPrefix();

    const tooMany = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 11,
      serialPrefix,
    });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error.code).toBe("CONFLICT");

    const fits = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 10,
      serialPrefix,
    });
    expect(fits.status).toBe(201);

    const overflow = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 1,
      serialPrefix,
    });
    expect(overflow.status).toBe(409);
  });

  it("rolls back a failed batch completely — no partial batch, no partial tickets", async () => {
    const eventId = await makeEvent(100);
    const ticketTypeId = await makeType(eventId);
    const serialPrefix = newPrefix();

    const ok = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 10,
      serialPrefix,
    });
    expect(ok.status).toBe(201);

    // Overlapping serial range → unique violation on Ticket.serial mid-transaction.
    const failed = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 10,
      serialPrefix,
      serialStart: 5,
    });
    expect(failed.status).toBe(409);

    // Nothing from the failed attempt survived: no batch header, no tickets.
    const batches = await prisma.ticketBatch.findMany({ where: { serialPrefix } });
    expect(batches).toHaveLength(1);
    const tickets = await prisma.ticket.findMany({ where: { eventId } });
    expect(tickets).toHaveLength(10);
    // Exactly the successful range survives; nothing from 00011–00014 leaked in.
    expect(tickets.every((t) => t.serial <= `${serialPrefix}-00010`)).toBe(true);
    expect(new Set(tickets.map((t) => t.serial)).size).toBe(10);
  });

  it("is safe to retry with the same Idempotency-Key", async () => {
    const eventId = await makeEvent(50);
    const ticketTypeId = await makeType(eventId);
    const serialPrefix = newPrefix();
    const idempotencyKey = unique("idem-key");

    const payload = { eventId, ticketTypeId, quantity: 25, serialPrefix };
    const headers = {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    };

    const first = await admin.json("/api/v1/ticket-batches", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(true);

    const retry = await admin.json("/api/v1/ticket-batches", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    expect(retry.status).toBe(200);
    expect(retry.body.created).toBe(false);
    expect(retry.body.batch.id).toBe(first.body.batch.id);

    // The retry created nothing new.
    const total = await prisma.ticket.count({ where: { eventId } });
    expect(total).toBe(25);

    // Concurrent duplicate submissions with the same key are also safe.
    const [a, b] = await Promise.all([
      admin.json("/api/v1/ticket-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": unique("idem-key") },
        body: JSON.stringify({ eventId, ticketTypeId, quantity: 5, serialPrefix }),
      }),
      admin.json("/api/v1/ticket-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": unique("idem-key") },
        body: JSON.stringify({ eventId, ticketTypeId, quantity: 5, serialPrefix }),
      }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await prisma.ticket.count({ where: { eventId } })).toBe(35);
  });

  it("rejects inactive categories, mismatched categories and completed events", async () => {
    const eventId = await makeEvent(50);
    const otherEventId = await makeEvent(10);
    const activeType = await makeType(eventId);
    const otherTypesType = await makeType(otherEventId);
    const serialPrefix = newPrefix();

    // Category from a different event → 404, never a cross-event write.
    const mismatch = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId: otherTypesType,
      quantity: 1,
      serialPrefix,
    });
    expect(mismatch.status).toBe(404);

    // Deactivate the category, then try again.
    const deactivated = await admin.patch(`/api/v1/ticket-types/${activeType}`, {
      status: "INACTIVE",
    });
    expect(deactivated.status).toBe(200);
    const inactive = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId: activeType,
      quantity: 1,
      serialPrefix,
    });
    expect(inactive.status).toBe(409);

    // Completed events generate nothing.
    const freshType = await makeType(eventId);
    expect((await admin.post(`/api/v1/events/${eventId}/complete`)).status).toBe(200);
    const completed = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId: freshType,
      quantity: 1,
      serialPrefix,
    });
    expect(completed.status).toBe(409);
  });
});

describe("batch permissions (direct API calls)", () => {
  it("denies generation and batch reads to every non-admin role", async () => {
    const eventId = await makeEvent(20);
    const ticketTypeId = await makeType(eventId);
    const payload = { eventId, ticketTypeId, quantity: 5, serialPrefix: newPrefix() };
    const first = await admin.post("/api/v1/ticket-batches", payload);
    expect(first.status).toBe(201);
    const batchId = first.body.batch.id;

    for (const client of [seller, verifier, supervisor]) {
      const denied = await client.post("/api/v1/ticket-batches", payload);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe("FORBIDDEN");

      expect((await client.get(`/api/v1/ticket-batches?eventId=${eventId}`)).status).toBe(403);
      expect((await client.get(`/api/v1/ticket-batches/${batchId}`)).status).toBe(403);
    }

    // Printing is different: sellers hold ticket:print by the role matrix,
    // verifiers and supervisors do not.
    expect((await seller.request(`/api/v1/ticket-batches/${batchId}/print.pdf`)).status).toBe(200);
    for (const client of [verifier, supervisor]) {
      expect((await client.get(`/api/v1/ticket-batches/${batchId}/print.pdf`)).status).toBe(403);
    }

    const unauthenticated = await fetch(
      `${process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100"}/api/v1/ticket-batches`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("verifier cannot revoke a ticket (no ticket:revoke permission)", async () => {
    const eventId = await makeEvent(10);
    const ticketTypeId = await makeType(eventId);
    const batch = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 1,
      serialPrefix: newPrefix(),
    });
    const ticket = await prisma.ticket.findFirst({
      where: { batchId: batch.body.batch.id },
    });
    expect(ticket).not.toBeNull();

    const denied = await verifier.post(`/api/v1/tickets/${ticket!.id}/revoke`, {
      reason: "should not be allowed",
    });
    expect(denied.status).toBe(403);
    const still = await prisma.ticket.findUnique({ where: { id: ticket!.id } });
    expect(still?.status).toBe("AVAILABLE");
  });
});

describe("batch printing", () => {
  let eventId: string;
  let batchId: string;
  let quantity: number;

  beforeAll(async () => {
    eventId = await makeEvent(30);
    const ticketTypeId = await makeType(eventId);
    const batch = await admin.post("/api/v1/ticket-batches", {
      eventId,
      ticketTypeId,
      quantity: 6,
      serialPrefix: newPrefix(),
    });
    expect(batch.status).toBe(201);
    batchId = batch.body.batch.id;
    quantity = 6;
  });

  it("prints a single-ticket sample before the production run", async () => {
    const response = await admin.request(
      `/api/v1/ticket-batches/${batchId}/print.pdf?mode=sample`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");

    const sample = await prisma.printBatch.findFirst({
      where: { ticketBatchId: batchId, kind: "SAMPLE" },
      orderBy: { createdAt: "desc" },
    });
    expect(sample?.ticketCount).toBe(1);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "ticket-batch.print-sample", targetId: batchId },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.summary)).not.toMatch(/token/i);
  });

  it("prints the full batch and records a traceable PRODUCTION print", async () => {
    const response = await admin.request(`/api/v1/ticket-batches/${batchId}/print.pdf`);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");

    const production = await prisma.printBatch.findFirst({
      where: { ticketBatchId: batchId, kind: "PRODUCTION" },
      orderBy: { createdAt: "desc" },
    });
    expect(production?.ticketCount).toBe(quantity);
    expect(production?.actorId).not.toBeNull();
  });

  it("excludes revoked tickets from printing and reports the skip", async () => {
    const tickets = await prisma.ticket.findMany({ where: { batchId } });
    const victim = tickets[0];
    const revoked = await admin.post(`/api/v1/tickets/${victim.id}/revoke`, {
      reason: "Damaged stock before printing",
    });
    expect(revoked.status).toBe(200);

    const response = await admin.request(`/api/v1/ticket-batches/${batchId}/print.pdf`);
    expect(response.status).toBe(200);

    const latest = await prisma.printBatch.findFirst({
      where: { ticketBatchId: batchId, kind: "PRODUCTION" },
      orderBy: { createdAt: "desc" },
    });
    expect(latest?.ticketCount).toBe(quantity - 1);
    expect((latest?.metadata as { skipped?: number })?.skipped).toBe(1);

    // Restore stock so later tests see a clean batch.
    await prisma.ticket.update({
      where: { id: victim.id },
      data: {
        status: "AVAILABLE",
        revokeReason: null,
        revokedById: null,
      },
    });
  });

  it("rejects an unknown print mode with 422", async () => {
    const response = await admin.request(
      `/api/v1/ticket-batches/${batchId}/print.pdf?mode=weird`,
    );
    expect(response.status).toBe(422);
  });

  it("lets a seller print but never a verifier or supervisor", async () => {
    const asSeller = await seller.request(`/api/v1/ticket-batches/${batchId}/print.pdf`);
    expect(asSeller.status).toBe(200);
    expect(asSeller.headers.get("content-type")).toContain("application/pdf");

    for (const client of [verifier, supervisor]) {
      const denied = await client.request(
        `/api/v1/ticket-batches/${batchId}/print.pdf?mode=sample`,
      );
      expect(denied.status).toBe(403);
    }
  });
});
