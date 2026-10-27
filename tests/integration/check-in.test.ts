import { beforeAll, describe, expect, it } from "vitest";
import { generateQrToken, hashQrToken } from "@/lib/qr/tokens";
import { loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";

let admin: TestClient;
let seller: TestClient;
beforeAll(async () => { admin = await loginAs("admin"); seller = await loginAs("seller"); });
const keyed = (client: TestClient, url: string, data: unknown, key: string) => client.json(url, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(data) });

async function soldTicket(paid = true) {
  const event = await admin.post("/api/v1/events", { name: unique("Admission event"), venue: "KSP Hotel Gulu", status: "SCHEDULED", eventDate: "2026-12-05", startTime: "18:00", endTime: "23:00", capacity: 100 });
  const eventId = event.body.event.id as string;
  await admin.post(`/api/v1/events/${eventId}/open-sales`);
  const type = await admin.post(`/api/v1/events/${eventId}/ticket-types`, { name: unique("Entry"), priceUgx: 12_000 });
  const typeId = type.body.ticketType.id as string;
  const batch = await admin.post("/api/v1/ticket-batches", { eventId, ticketTypeId: typeId, quantity: 1, serialPrefix: `C${Date.now().toString(36).slice(-6).toUpperCase()}` });
  const sale = await keyed(admin, "/api/v1/sales", { eventId, items: [{ ticketTypeId: typeId, quantity: 1 }], ...(paid ? { initialPayment: { amountUgx: 12_000, method: "CASH" } } : {}) }, unique("admission-sale"));
  expect(batch.status).toBe(201); expect(sale.status).toBe(201);
  await admin.post(`/api/v1/events/${eventId}/open-admission`);
  const ticket = await prisma.ticket.findFirstOrThrow({ where: { eventId, ticketTypeId: typeId } });
  const token = generateQrToken();
  await prisma.ticket.update({ where: { id: ticket.id }, data: { tokenHash: hashQrToken(token) } });
  return { eventId, ticketId: ticket.id, serial: ticket.serial, token, saleId: sale.body.sale.id as string };
}

describe("admission and duplicate protection", () => {
  it("makes verification read-only and admits at most one of ten concurrent confirmations", async () => {
    const fixture = await soldTicket();
    const verify = await admin.post("/api/v1/check-in/verify-qr", { eventId: fixture.eventId, token: fixture.token, gate: "Main" });
    expect(verify.status).toBe(200); expect(verify.body.eligible).toBe(true);
    expect(await prisma.checkIn.count({ where: { ticketId: fixture.ticketId } })).toBe(0);
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => keyed(admin, "/api/v1/check-in/confirm", { eventId: fixture.eventId, method: "QR", token: fixture.token, gate: "Main" }, unique(`checkin-race-${i}`))));
    expect(responses.filter((r) => r.body.admitted)).toHaveLength(1);
    expect(await prisma.checkIn.count({ where: { ticketId: fixture.ticketId } })).toBe(1);
  });

  it("requires payment and enforces verifier permissions", async () => {
    const fixture = await soldTicket(false);
    const verify = await admin.post("/api/v1/check-in/verify-serial", { eventId: fixture.eventId, serial: fixture.serial });
    expect(verify.body.code).toBe("NOT_PAID");
    const confirm = await keyed(admin, "/api/v1/check-in/confirm", { eventId: fixture.eventId, method: "MANUAL", serial: fixture.serial, gate: "Main" }, unique("unpaid-confirm"));
    expect(confirm.body.admitted).toBe(false); expect(confirm.body.code).toBe("NOT_PAID");
    expect((await seller.post("/api/v1/check-in/verify-serial", { eventId: fixture.eventId, serial: fixture.serial })).status).toBe(403);
  });

  it("keeps the 10-phone verification p95 below one second on the test host", async () => {
    const fixture = await soldTicket();
    const phones = await Promise.all(Array.from({ length: 10 }, () => loginAs("verifier")));
    const started = performance.now();
    const results = await Promise.all(phones.map(async (phone) => {
      const requestStart = performance.now();
      const response = await phone.post("/api/v1/check-in/verify-serial", { eventId: fixture.eventId, serial: fixture.serial });
      return { elapsedMs: performance.now() - requestStart, status: response.status };
    }));
    const elapsedMs = performance.now() - started;
    const ordered = results.map((item) => item.elapsedMs).sort((a, b) => a - b);
    const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Infinity;
    expect(results.every((item) => item.status === 200)).toBe(true);
    expect(p95).toBeLessThan(1_000);
    console.info(`[load] 10 concurrent serial verifications completed in ${elapsedMs.toFixed(1)} ms; p95=${p95.toFixed(1)} ms`);
  });

  it("stores failed scan metadata without storing QR token values", async () => {
    const fixture = await soldTicket();
    const fake = `unknown-${fixture.token}`;
    const response = await admin.post("/api/v1/check-in/verify-qr", { eventId: fixture.eventId, token: fake });
    expect(response.body.code).toBe("INVALID_QR");
    const attempt = await prisma.scanAttempt.findFirstOrThrow({ where: { eventId: fixture.eventId } });
    expect(JSON.stringify(attempt)).not.toContain(fake);
    expect("token" in attempt).toBe(false);
  });

  it("rejects revoked, expired, and other-event tickets", async () => {
    const revoked = await soldTicket();
    await prisma.ticket.update({ where: { id: revoked.ticketId }, data: { status: "REVOKED", revokeReason: "Test revocation" } });
    expect((await admin.post("/api/v1/check-in/verify-serial", { eventId: revoked.eventId, serial: revoked.serial })).body.code).toBe("TICKET_REVOKED");

    const expired = await soldTicket();
    await prisma.event.update({ where: { id: expired.eventId }, data: { admissionClosesAt: new Date(Date.now() - 60_000) } });
    expect((await admin.post("/api/v1/check-in/verify-serial", { eventId: expired.eventId, serial: expired.serial })).body.code).toBe("EXPIRED");

    const otherEvent = await soldTicket();
    expect((await admin.post("/api/v1/check-in/verify-serial", { eventId: expired.eventId, serial: otherEvent.serial })).body.code).toBe("OTHER_EVENT");
  });
});
