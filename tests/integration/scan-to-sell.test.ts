import { beforeAll, describe, expect, it } from "vitest";
import { encryptToken } from "@/lib/qr/token-vault";
import { generateQrToken, hashQrToken } from "@/lib/qr/tokens";
import { prisma } from "../helpers/db";
import { loginAs, TestClient, unique } from "../helpers/client";

let admin: TestClient;
let seller: TestClient;
let verifier: TestClient;
let supervisor: TestClient;

beforeAll(async () => {
  [admin, seller, verifier, supervisor] = await Promise.all([loginAs("superadmin"), loginAs("seller"), loginAs("verifier"), loginAs("supervisor")]);
});

const postKey = (client: TestClient, url: string, data: unknown, key = unique("scan-sale")) => client.json(url, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(data) });

async function fixture(options: { requireBuyerDetails?: boolean; requireStockIssue?: boolean; allowSellerManualSale?: boolean; requireFullPaymentAtSale?: boolean; buyerNoticeText?: string; status?: "DRAFT" | "SCHEDULED"; quantity?: number } = {}) {
  const event = await admin.post("/api/v1/events", {
    name: unique("Scan to sell"), venue: "KSP Hotel Gulu", eventDate: "2026-12-05", startTime: "18:00", endTime: "23:00", capacity: 100,
    status: options.status ?? "SCHEDULED", requireBuyerDetails: options.requireBuyerDetails ?? true, requireStockIssue: options.requireStockIssue ?? true,
    allowSellerManualSale: options.allowSellerManualSale ?? false, requireFullPaymentAtSale: options.requireFullPaymentAtSale ?? true,
    buyerNoticeText: options.buyerNoticeText ?? "Your details are collected for ticket records.",
  });
  expect(event.status).toBe(201);
  const eventId = event.body.event.id as string;
  if (options.status !== "DRAFT") expect((await admin.post(`/api/v1/events/${eventId}/open-sales`)).status).toBe(200);
  const type = await admin.post(`/api/v1/events/${eventId}/ticket-types`, { name: unique("Entry"), priceUgx: 12_000 });
  expect(type.status).toBe(201);
  const ticketTypeId = type.body.ticketType.id as string;
  const batch = await admin.post("/api/v1/ticket-batches", { eventId, ticketTypeId, quantity: options.quantity ?? 3, serialPrefix: `Q${Date.now().toString(36).slice(-6).toUpperCase()}` });
  expect(batch.status).toBe(201);
  const tickets = await prisma.ticket.findMany({ where: { eventId }, orderBy: { serial: "asc" } });
  const tokens = new Map<string, string>();
  for (const ticket of tickets) {
    const token = generateQrToken();
    await prisma.ticket.update({ where: { id: ticket.id }, data: { tokenHash: hashQrToken(token), tokenEnc: encryptToken(token) } });
    tokens.set(ticket.id, token);
  }
  const sellerId = (await prisma.user.findUniqueOrThrow({ where: { username: "seller" }, select: { id: true } })).id;
  const issue = await admin.json("/api/v1/stock/issues", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": unique("scan-fixture-issue") },
    body: JSON.stringify({ eventId, sellerId, selection: { kind: "SERIALS", serials: tickets.map((ticket) => ticket.serial) } }),
  });
  expect(issue.status).toBe(201);
  return { eventId, ticketTypeId, tickets, tokens };
}

const buyer = { customerName: "Amina Guest", customerPhone: "0772 123 456" };
const fullPayment = { amountUgx: 12_000, method: "CASH" };

describe("scan-to-sell backend", () => {
  it("looks up a QR without changing inventory, then sells exactly that ticket by its token", async () => {
    const data = await fixture();
    const selected = data.tickets[1];
    const token = data.tokens.get(selected.id)!;
    const lookup = await seller.post("/api/v1/sales/lookup-ticket", { eventId: data.eventId, token });
    expect(lookup.status).toBe(200);
    expect(lookup.body.state).toBe("SALEABLE");
    expect(lookup.body.buyerNoticeText).toBe("Your details are collected for ticket records.");
    expect(lookup.body.ticket).toEqual({ serial: selected.serial, ticketTypeName: expect.any(String), priceUgx: 12_000 });
    expect(lookup.body).not.toHaveProperty("ticket.id");
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: selected.id } })).toMatchObject({ status: "AVAILABLE" });
    expect(await prisma.checkIn.count({ where: { ticketId: selected.id } })).toBe(0);
    const scanAttempt = await prisma.scanAttempt.findFirstOrThrow({ where: { actorId: (await prisma.user.findUniqueOrThrow({ where: { username: "seller" } })).id, purpose: "SALE", eventId: data.eventId }, orderBy: { attemptedAt: "desc" } });
    expect(scanAttempt).toMatchObject({ ticketId: selected.id, resultCode: "SALEABLE", method: "QR" });
    const lookupAudit = await prisma.auditLog.findFirstOrThrow({ where: { eventId: data.eventId, action: "sale.ticket.lookup", targetId: selected.id } });
    expect(lookupAudit.summary).toMatchObject({ method: "QR", result: "SALEABLE", serial: selected.serial });
    expect(JSON.stringify(lookupAudit.summary)).not.toContain(token);

    const saleKey = unique("scanned-idempotent");
    const saleBody = { eventId: data.eventId, tickets: [{ token }], ...buyer, initialPayment: fullPayment };
    const created = await postKey(seller, "/api/v1/sales", saleBody, saleKey);
    expect(created.status).toBe(201);
    const retry = await postKey(seller, "/api/v1/sales", saleBody, saleKey);
    expect(retry.status).toBe(200);
    expect(retry.body.sale.id).toBe(created.body.sale.id);
    expect(created.body.sale.items).toHaveLength(1);
    expect(created.body.sale.items[0].tickets).toEqual([{ id: expect.any(String), serial: selected.serial, status: "SOLD" }]);
    expect(created.body.sale.customerPhone).toBe(buyer.customerPhone);
    expect(JSON.stringify(created.body)).not.toContain(token);
    const persisted = await prisma.sale.findUniqueOrThrow({ where: { id: created.body.sale.id } });
    expect(persisted.customerPhoneNormalized).toBe("+256772123456");
    const allocation = await prisma.saleTicket.findUniqueOrThrow({ where: { ticketId: selected.id } });
    expect(allocation).toMatchObject({ saleId: created.body.sale.id, entryMethod: "SCAN" });
    expect(allocation.scannedAt).toBeInstanceOf(Date);
    expect(await prisma.ticket.count({ where: { eventId: data.eventId, status: "AVAILABLE" } })).toBe(2);
    expect(JSON.stringify(await prisma.auditLog.findMany({ where: { eventId: data.eventId, action: "sale.create" } }))).not.toContain(token);
    const soldLookup = await seller.post("/api/v1/sales/lookup-ticket", { eventId: data.eventId, token });
    expect(soldLookup.body.state).toBe("ALREADY_SOLD");
  });

  it("enforces required buyer details, Uganda phone formats, full seller payment and administrator partial payment", async () => {
    const data = await fixture();
    const ticket = data.tickets[0];
    const token = data.tokens.get(ticket.id)!;
    expect((await postKey(seller, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token }], initialPayment: fullPayment })).status).toBe(422);
    const invalidPhone = await postKey(seller, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token }], customerName: "Amina", customerPhone: "not-a-phone", initialPayment: fullPayment });
    expect(invalidPhone.status).toBe(422);
    const unpaid = await postKey(seller, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token }], ...buyer });
    expect(unpaid.status).toBe(409);
    const paid = await postKey(seller, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token }], ...buyer, initialPayment: fullPayment });
    expect(paid.status).toBe(201);

    const adminData = await fixture();
    const adminToken = adminData.tokens.get(adminData.tickets[0].id)!;
    const partial = await postKey(admin, "/api/v1/sales", { eventId: adminData.eventId, tickets: [{ token: adminToken }], ...buyer, initialPayment: { amountUgx: 4_000, method: "CASH" } });
    expect(partial.status).toBe(201);
    expect(partial.body.sale.status).toBe("PARTIALLY_PAID");
  });

  it("rejects ticket ids, restricts bulk quantity sales to admins, and flags manual serial sales", async () => {
    const data = await fixture({ allowSellerManualSale: true });
    const sellerBulk = await postKey(seller, "/api/v1/sales", { eventId: data.eventId, items: [{ ticketTypeId: data.ticketTypeId, quantity: 1 }], ...buyer, initialPayment: fullPayment });
    expect(sellerBulk.status).toBe(403);
    const forgedId = await postKey(seller, "/api/v1/sales", { eventId: data.eventId, tickets: [{ ticketId: data.tickets[0].id }], ...buyer, initialPayment: fullPayment });
    expect(forgedId.status).toBe(422);
    const disabled = await fixture({ allowSellerManualSale: false });
    const denied = await postKey(seller, "/api/v1/sales", { eventId: disabled.eventId, tickets: [{ serial: disabled.tickets[0].serial, entryMethod: "MANUAL" }], ...buyer, initialPayment: fullPayment });
    expect(denied.status).toBe(403);
    const manual = await postKey(seller, "/api/v1/sales", { eventId: data.eventId, tickets: [{ serial: data.tickets[0].serial, entryMethod: "MANUAL" }], ...buyer, initialPayment: fullPayment });
    expect(manual.status).toBe(201);
    const saleTicket = await prisma.saleTicket.findUniqueOrThrow({ where: { ticketId: data.tickets[0].id } });
    expect(saleTicket.entryMethod).toBe("MANUAL");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "sale.create", targetId: manual.body.sale.id } });
    expect(JSON.stringify(audit.summary)).toContain("MANUAL");
  });

  it("returns the distinct sellability states and records SALE attempts without storing tokens", async () => {
    const data = await fixture({ quantity: 5 });
    const other = await fixture({ quantity: 1 });
    const tokenAt = (index: number) => data.tokens.get(data.tickets[index].id)!;
    const unknown = await seller.post("/api/v1/sales/lookup-ticket", { eventId: data.eventId, token: generateQrToken() });
    expect(unknown.body.state).toBe("INVALID_QR");
    const unknownSerial = await seller.post("/api/v1/sales/lookup-ticket", { eventId: data.eventId, serial: "UNKNOWN-99999" });
    expect(unknownSerial.body.state).toBe("UNKNOWN_SERIAL");
    const otherEvent = await seller.post("/api/v1/sales/lookup-ticket", { eventId: other.eventId, token: tokenAt(0) });
    expect(otherEvent.body.state).toBe("OTHER_EVENT");
    expect(otherEvent.body.ticket).toBeUndefined();
    await prisma.ticket.update({ where: { id: data.tickets[1].id }, data: { status: "CANCELLED" } });
    await prisma.ticket.update({ where: { id: data.tickets[2].id }, data: { status: "REVOKED", revokeReason: "T4 sellability test", revokedById: (await prisma.user.findUniqueOrThrow({ where: { username: "admin" } })).id } });
    expect((await seller.post("/api/v1/sales/lookup-ticket", { eventId: data.eventId, token: tokenAt(1) })).body.state).toBe("TICKET_CANCELLED");
    expect((await seller.post("/api/v1/sales/lookup-ticket", { eventId: data.eventId, token: tokenAt(2) })).body.state).toBe("TICKET_REVOKED");
    await prisma.ticketType.update({ where: { id: data.ticketTypeId }, data: { status: "INACTIVE" } });
    expect((await seller.post("/api/v1/sales/lookup-ticket", { eventId: data.eventId, token: tokenAt(3) })).body.state).toBe("TICKET_TYPE_INACTIVE");
    await prisma.ticketType.update({ where: { id: data.ticketTypeId }, data: { status: "ACTIVE" } });
    expect((await admin.post(`/api/v1/events/${data.eventId}/close-sales`)).status).toBe(200);
    expect((await seller.post("/api/v1/sales/lookup-ticket", { eventId: data.eventId, token: tokenAt(3) })).body.state).toBe("SALES_CLOSED");
    const draft = await fixture({ status: "DRAFT", quantity: 1 });
    expect((await seller.post("/api/v1/sales/lookup-ticket", { eventId: draft.eventId, token: draft.tokens.get(draft.tickets[0].id) })).body.state).toBe("EVENT_NOT_SELLING");
    const attempts = await prisma.scanAttempt.findMany({ where: { eventId: { in: [data.eventId, other.eventId] }, purpose: "SALE" } });
    expect(attempts.length).toBeGreaterThanOrEqual(6);
    expect(attempts.every((attempt) => !("token" in attempt))).toBe(true);
    expect(attempts.map((attempt) => attempt.resultCode)).toContain("OTHER_EVENT");
  });

  it("serializes two sellers racing to sell one ticket and returns one conflict", async () => {
    const data = await fixture({ quantity: 1, requireStockIssue: false });
    const token = data.tokens.get(data.tickets[0].id)!;
    const username = unique("seller").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
    const created = await admin.post("/api/v1/users", { displayName: "Second Seller", username, role: "SELLER", password: "SecondSeller!Password123" });
    expect(created.status).toBe(201);
    const secondSeller = new TestClient();
    expect((await secondSeller.post("/api/v1/auth/login", { identifier: username, password: "SecondSeller!Password123" })).status).toBe(200);
    const body = { eventId: data.eventId, tickets: [{ token }], ...buyer, initialPayment: fullPayment };
    const results = await Promise.all([postKey(seller, "/api/v1/sales", body), postKey(secondSeller, "/api/v1/sales", body)]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.saleTicket.count({ where: { ticketId: data.tickets[0].id } })).toBe(1);
    expect(await prisma.sale.count({ where: { eventId: data.eventId } })).toBe(1);
  });

  it("keeps verifier lookup denied and allows buyer detail reveal only to supervisor/admin", async () => {
    const data = await fixture({ requireBuyerDetails: false });
    const token = data.tokens.get(data.tickets[0].id)!;
    const sale = await postKey(admin, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token }], ...buyer, initialPayment: fullPayment });
    expect(sale.status).toBe(201);
    const denied = await verifier.post("/api/v1/check-in/buyer-details", { eventId: data.eventId, serial: data.tickets[0].serial });
    expect(denied.status).toBe(403);
    const visible = await supervisor.post("/api/v1/check-in/buyer-details", { eventId: data.eventId, serial: data.tickets[0].serial });
    expect(visible.status).toBe(200);
    expect(visible.body.customerPhone).toBe(buyer.customerPhone);
    expect((await admin.post(`/api/v1/events/${data.eventId}/open-admission`)).status).toBe(200);
    const admitted = await postKey(admin, "/api/v1/check-in/confirm", { eventId: data.eventId, method: "QR", token, gate: "Main" }, unique("buyer-gate-checkin"));
    expect(admitted.body.admitted).toBe(true);
    const verifierDuplicate = await verifier.post("/api/v1/check-in/verify-serial", { eventId: data.eventId, serial: data.tickets[0].serial });
    expect(verifierDuplicate.body.code).toBe("ALREADY_USED");
    expect(verifierDuplicate.body).not.toHaveProperty("buyerDetails");
    const supervisorDuplicate = await supervisor.post("/api/v1/check-in/verify-serial", { eventId: data.eventId, serial: data.tickets[0].serial });
    expect(supervisorDuplicate.body.buyerDetails).toEqual({ customerName: buyer.customerName, customerPhone: buyer.customerPhone });
    const audits = await prisma.auditLog.findMany({ where: { action: "buyer.details.reveal", targetType: "ticket", targetId: data.tickets[0].id } });
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits[0].summary)).not.toContain(buyer.customerPhone);
    expect((await verifier.get("/api/v1/sales")).status).toBe(403);
    expect((await verifier.get(`/api/v1/reports?eventId=${data.eventId}&type=SALES_BY_CATEGORY`)).status).toBe(403);
    expect((await verifier.get(`/api/v1/check-in/recent?eventId=${data.eventId}`)).status).toBe(200);
    const verifierRecent = await verifier.get(`/api/v1/check-in/recent?eventId=${data.eventId}`);
    expect(JSON.stringify(verifierRecent.body)).not.toContain(buyer.customerPhone);
    expect(JSON.stringify(verifierRecent.body)).not.toContain(buyer.customerName);
    const verifierReports = await verifier.get(`/api/v1/reports/export?eventId=${data.eventId}&type=SALES_BY_CATEGORY&format=csv`);
    expect(verifierReports.status).toBe(403);
    expect(JSON.stringify(verifierReports.body)).not.toContain(buyer.customerPhone);
  });
});
