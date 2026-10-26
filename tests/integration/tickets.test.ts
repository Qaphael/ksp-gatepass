import { beforeAll, describe, expect, it } from "vitest";
import { loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";

/**
 * PRD 13.2 — inventory reads, revocation, reprint identity and CSV export.
 * The recurring theme: token material must never appear in any API response or
 * export, and reprints must preserve the original ticket identity.
 */

let admin: TestClient;
let seller: TestClient;
let verifier: TestClient;
let supervisor: TestClient;

let eventId: string;
let batchId: string;
let serialPrefix: string;

function newPrefix(): string {
  return (
    "Q" + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5)
  ).toUpperCase();
}

beforeAll(async () => {
  admin = await loginAs("admin");
  seller = await loginAs("seller");
  verifier = await loginAs("verifier");
  supervisor = await loginAs("supervisor");

  const event = await admin.post("/api/v1/events", {
    name: unique("Inventory Event"),
    venue: "KSP Hotel Gulu",
    eventDate: "2026-12-05",
    startTime: "18:00",
    endTime: "23:00",
    capacity: 200,
  });
  expect(event.status).toBe(201);
  eventId = event.body.event.id;

  const type = await admin.post(`/api/v1/events/${eventId}/ticket-types`, {
    name: unique("General"),
    priceUgx: 10_000,
  });
  expect(type.status).toBe(201);

  serialPrefix = newPrefix();
  const batch = await admin.post("/api/v1/ticket-batches", {
    eventId,
    ticketTypeId: type.body.ticketType.id,
    quantity: 12,
    serialPrefix,
  });
  expect(batch.status).toBe(201);
  batchId = batch.body.batch.id;
});

describe("inventory list and detail", () => {
  it("paginates, filters and searches by serial", async () => {
    const page1 = await admin.get(
      `/api/v1/tickets?eventId=${eventId}&page=1&pageSize=5`,
    );
    expect(page1.status).toBe(200);
    expect(page1.body.tickets).toHaveLength(5);
    expect(page1.body.total).toBe(12);
    expect(page1.body.page).toBe(1);

    const page3 = await admin.get(
      `/api/v1/tickets?eventId=${eventId}&page=3&pageSize=5`,
    );
    expect(page3.body.tickets).toHaveLength(2);

    const available = await admin.get(
      `/api/v1/tickets?eventId=${eventId}&status=AVAILABLE&pageSize=100`,
    );
    expect(available.body.total).toBeGreaterThanOrEqual(12);

    const sold = await admin.get(`/api/v1/tickets?eventId=${eventId}&status=SOLD`);
    expect(sold.body.total).toBe(0);

    // Batch filter scopes to exactly this generation run.
    const byBatch = await admin.get(`/api/v1/tickets?batchId=${batchId}&pageSize=100`);
    expect(byBatch.body.total).toBe(12);
    expect(byBatch.body.tickets.every((t: { batchId: string }) => t.batchId === batchId)).toBe(true);

    // Serial prefix search narrows the result set: `-0000` matches
    // 00001..00009 but not 00010..00012.
    const search = await admin.get(
      `/api/v1/tickets?eventId=${eventId}&search=${serialPrefix}-0000&pageSize=100`,
    );
    expect(search.body.total).toBe(9); // 00001..00009

    const exact = await admin.get(
      `/api/v1/tickets?eventId=${eventId}&search=${serialPrefix}-00007`,
    );
    expect(exact.body.total).toBe(1);
    expect(exact.body.tickets[0].serial).toBe(`${serialPrefix}-00007`);

    const badStatus = await admin.get(`/api/v1/tickets?status=NONSENSE`);
    expect(badStatus.status).toBe(422);
  });

  it("returns lifecycle detail with audit history but zero token material", async () => {
    const listed = await admin.get(`/api/v1/tickets?eventId=${eventId}&search=${serialPrefix}-00001`);
    const id = listed.body.tickets[0].id as string;

    const detail = await admin.get(`/api/v1/tickets/${id}`);
    expect(detail.status).toBe(200);
    const ticket = detail.body.ticket;

    expect(ticket.serial).toBe(`${serialPrefix}-00001`);
    expect(ticket.status).toBe("AVAILABLE");
    expect(ticket.eventId).toBe(eventId);
    expect(ticket.batchRef).toBeTruthy();
    expect(ticket.ticketTypeName).toBeTruthy();
    expect(Array.isArray(ticket.auditHistory)).toBe(true);
    expect(Array.isArray(ticket.printHistory)).toBe(true);

    // The exact stored secrets must not appear anywhere in the payload.
    const record = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    const raw = JSON.stringify(detail.body);
    expect(raw).not.toContain(record.tokenHash);
    expect(raw).not.toContain(record.tokenEnc);
    expect(raw).not.toMatch(/tokenHash|tokenEnc/);
    expect("tokenHash" in ticket).toBe(false);
    expect("tokenEnc" in ticket).toBe(false);

    const missing = await admin.get("/api/v1/tickets/does-not-exist");
    expect(missing.status).toBe(404);
  });

  it("denies inventory reads to non-admin roles and anonymous callers", async () => {
    expect((await seller.get(`/api/v1/tickets?eventId=${eventId}`)).status).toBe(403);
    expect((await verifier.get(`/api/v1/tickets?eventId=${eventId}`)).status).toBe(403);
    expect((await supervisor.get(`/api/v1/tickets?eventId=${eventId}`)).status).toBe(403);

    const anonymous = await fetch(
      `${process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100"}/api/v1/tickets`,
    );
    expect(anonymous.status).toBe(401);
  });
});

describe("revocation", () => {
  it("revokes with a mandatory reason and writes an audit record", async () => {
    const listed = await admin.get(`/api/v1/tickets?eventId=${eventId}&search=${serialPrefix}-00002`);
    const id = listed.body.tickets[0].id as string;

    const noReason = await admin.post(`/api/v1/tickets/${id}/revoke`, {});
    expect(noReason.status).toBe(422);
    const tooShort = await admin.post(`/api/v1/tickets/${id}/revoke`, { reason: "x" });
    expect(tooShort.status).toBe(422);

    const reason = "Printed in error — voided at source";
    const revoked = await admin.post(`/api/v1/tickets/${id}/revoke`, { reason });
    expect(revoked.status).toBe(200);
    expect(revoked.body.ticket.status).toBe("REVOKED");
    expect(revoked.body.ticket.revokeReason).toBe(reason);
    expect(revoked.body.ticket.revokedById).toBeTruthy();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "ticket.revoke", targetId: id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.outcome).toBe("SUCCESS");
    expect(JSON.stringify(audit?.summary)).toContain(`${serialPrefix}-00002`);
    expect(JSON.stringify(audit?.summary)).toContain(reason);

    // Revocation is final — no double revoke, no silent state flip-flop.
    const again = await admin.post(`/api/v1/tickets/${id}/revoke`, { reason: "again" });
    expect(again.status).toBe(409);
  });

  it("enforces reason at the database level and refuses sold stock", async () => {
    // A REVOKED row without a reason must be impossible even for direct writes.
    const fresh = await prisma.ticket.findFirst({
      where: { eventId, status: "AVAILABLE", serial: { startsWith: `${serialPrefix}-00003` } },
    });
    expect(fresh).not.toBeNull();
    await expect(
      prisma.ticket.update({
        where: { id: fresh!.id },
        data: { status: "REVOKED", revokeReason: null },
      }),
    ).rejects.toThrow();

    // SOLD stock is out of scope for revocation (sale cancellation is the
    // consistent path and arrives in Phase 3).
    await prisma.ticket.update({
      where: { id: fresh!.id },
      data: { status: "SOLD" },
    });
    const blocked = await admin.post(`/api/v1/tickets/${fresh!.id}/revoke`, {
      reason: "Trying to bypass the sale workflow",
    });
    expect(blocked.status).toBe(409);
    const unchanged = await prisma.ticket.findUniqueOrThrow({ where: { id: fresh!.id } });
    expect(unchanged.status).toBe("SOLD");
    await prisma.ticket.update({
      where: { id: fresh!.id },
      data: { status: "AVAILABLE" },
    });
  });
});

describe("reprint identity", () => {
  it("keeps the exact ticket identity across prints and audits every output", async () => {
    const listed = await admin.get(`/api/v1/tickets?eventId=${eventId}&search=${serialPrefix}-00004`);
    const id = listed.body.tickets[0].id as string;
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id } });

    // First single-ticket print = PRODUCTION.
    const first = await admin.request(`/api/v1/tickets/${id}/reprint`, { method: "POST" });
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("application/pdf");
    const firstBytes = new Uint8Array(await first.arrayBuffer());
    expect(String.fromCharCode(...firstBytes.slice(0, 5))).toBe("%PDF-");

    const afterFirst = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(afterFirst.tokenHash).toBe(before.tokenHash);
    expect(afterFirst.tokenEnc).toBe(before.tokenEnc);
    expect(afterFirst.serial).toBe(before.serial);

    const firstPrint = await prisma.printBatch.findFirst({
      where: { ticketId: id, kind: "PRODUCTION" },
    });
    expect(firstPrint?.ticketCount).toBe(1);
    expect(
      (await prisma.auditLog.count({ where: { action: "ticket.print", targetId: id } })),
    ).toBe(1);

    // Second print = REPRINT of the identical ticket (same token, rule 8).
    const second = await admin.request(`/api/v1/tickets/${id}/reprint`, { method: "POST" });
    expect(second.status).toBe(200);
    const secondBytes = new Uint8Array(await second.arrayBuffer());
    expect(String.fromCharCode(...secondBytes.slice(0, 5))).toBe("%PDF-");

    const afterSecond = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(afterSecond.tokenHash).toBe(before.tokenHash);
    expect(afterSecond.tokenEnc).toBe(before.tokenEnc);
    expect(
      (await prisma.printBatch.count({ where: { ticketId: id, kind: "REPRINT" } })),
    ).toBe(1);
    expect(
      (await prisma.auditLog.count({ where: { action: "ticket.reprint", targetId: id } })),
    ).toBe(1);

    // A verifier has no print permissions at all.
    const denied = await verifier.request(`/api/v1/tickets/${id}/reprint`, { method: "POST" });
    expect(denied.status).toBe(403);
  });

  it("refuses to reprint revoked tickets and lets a seller print authorised stock", async () => {
    // Revoked ticket from the revocation test cannot produce any new output.
    const revoked = await admin.get(`/api/v1/tickets?eventId=${eventId}&status=REVOKED&search=${serialPrefix}-00002`);
    const revokedId = revoked.body.tickets[0].id as string;
    const printRows = await prisma.printBatch.count({ where: { ticketId: revokedId } });
    const blocked = await admin.request(`/api/v1/tickets/${revokedId}/reprint`, { method: "POST" });
    expect(blocked.status).toBe(409);
    expect(await prisma.printBatch.count({ where: { ticketId: revokedId } })).toBe(printRows);

    // Sellers may print/reprint authorised tickets (role matrix, PRD 10.2).
    const sellerTicket = await admin.get(`/api/v1/tickets?eventId=${eventId}&search=${serialPrefix}-00005`);
    const sellerId = sellerTicket.body.tickets[0].id as string;
    const bySeller = await seller.request(`/api/v1/tickets/${sellerId}/reprint`, { method: "POST" });
    expect(bySeller.status).toBe(200);
    expect(bySeller.headers.get("content-type")).toContain("application/pdf");
  });
});

describe("CSV export", () => {
  it("exports authorised fields only, BOM-prefixed and formula-safe", async () => {
    // Leave a formula-looking reason in the export path to prove the guard.
    const listed = await admin.get(`/api/v1/tickets?eventId=${eventId}&search=${serialPrefix}-00006`);
    const id = listed.body.tickets[0].id as string;
    const formula = "=cmd|'/C calc'!A0";
    expect((await admin.post(`/api/v1/tickets/${id}/revoke`, { reason: formula })).status).toBe(200);

    const response = await admin.request(`/api/v1/tickets/export?eventId=${eventId}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("attachment");

    const bytes = new Uint8Array(await response.arrayBuffer());
    // UTF-8 BOM so Excel renders venue names correctly.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);

    expect(text).toContain("serial,status,event,category,batch,created,revoke reason");
    expect(text).toContain(`${serialPrefix}-00001`);
    expect(text).toContain("REVOKED");
    // Formula injection neutralised.
    expect(text).toContain(`'${formula}`);
    expect(text).not.toContain(`\n${formula}`);

    // No token material of any kind in the export.
    const secrets = await prisma.ticket.findMany({
      where: { eventId },
      select: { tokenHash: true, tokenEnc: true },
    });
    for (const secret of secrets) {
      expect(text).not.toContain(secret.tokenHash);
      expect(text).not.toContain(secret.tokenEnc);
    }
    expect(text).not.toMatch(/tokenHash|tokenEnc/);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "inventory.export", targetId: eventId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("requires an event scope and the export permission", async () => {
    const noEvent = await admin.request("/api/v1/tickets/export");
    expect(noEvent.status).toBe(422);

    for (const client of [seller, verifier, supervisor]) {
      const denied = await client.request(`/api/v1/tickets/export?eventId=${eventId}`);
      expect(denied.status).toBe(403);
    }
  });
});
