import { beforeAll, describe, expect, it } from "vitest";
import { encryptToken } from "@/lib/qr/token-vault";
import { generateQrToken, hashQrToken } from "@/lib/qr/tokens";
import { hashSessionToken, generateSessionToken, prisma } from "../helpers/db";
import { loginAs, TestClient, unique } from "../helpers/client";

let admin: TestClient;
let seller: TestClient;
let sellerId: string;
let supervisor: TestClient;
let verifier: TestClient;

beforeAll(async () => {
  [admin, seller, supervisor, verifier] = await Promise.all([loginAs("superadmin"), loginAs("seller"), loginAs("supervisor"), loginAs("verifier")]);
  sellerId = (await prisma.user.findUniqueOrThrow({ where: { username: "seller" } })).id;
});

const postKey = (client: TestClient, path: string, body: unknown, key = unique("stock")) => client.json(path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });

async function additionalSeller() {
  const user = await prisma.user.create({ data: { username: unique("seller"), displayName: "Second Seller", passwordHash: "test-only-no-login", role: "SELLER" } });
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 60_000);
  await prisma.session.create({ data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt } });
  const client = new TestClient();
  client.setRawCookie("ksp_session", token);
  return { user, client };
}

async function fixture(quantity = 3) {
  const event = await admin.post("/api/v1/events", {
    name: unique("Stock event"), venue: "KSP Hotel Gulu", eventDate: "2026-12-05",
    startTime: "18:00", endTime: "23:00", capacity: 100, status: "SCHEDULED",
    requireBuyerDetails: false, requireStockIssue: true,
  });
  expect(event.status).toBe(201);
  const eventId = event.body.event.id as string;
  expect((await admin.post(`/api/v1/events/${eventId}/open-sales`)).status).toBe(200);
  const category = await admin.post(`/api/v1/events/${eventId}/ticket-types`, { name: unique("Stock type"), priceUgx: 12_000 });
  expect(category.status).toBe(201);
  const batch = await admin.post("/api/v1/ticket-batches", { eventId, ticketTypeId: category.body.ticketType.id, quantity, serialPrefix: `S${Date.now().toString(36).slice(-6).toUpperCase()}` });
  expect(batch.status).toBe(201);
  const tickets = await prisma.ticket.findMany({ where: { eventId }, orderBy: { serial: "asc" } });
  const tokens = new Map<string, string>();
  for (const ticket of tickets) {
    const token = generateQrToken();
    await prisma.ticket.update({ where: { id: ticket.id }, data: { tokenHash: hashQrToken(token), tokenEnc: encryptToken(token) } });
    tokens.set(ticket.id, token);
  }
  return { eventId, ticketTypeId: category.body.ticketType.id as string, tickets, tokens };
}

describe("seller stock operations", () => {
  it("allows one concurrent issue for a ticket and retries the winning idempotency key", async () => {
    const data = await fixture(2);
    const body = { eventId: data.eventId, sellerId, selection: { kind: "SERIALS", serials: [data.tickets[0].serial] } };
    const keyA = unique("issue-race-a");
    const keyB = unique("issue-race-b");
    const [left, right] = await Promise.all([postKey(admin, "/api/v1/stock/issues", body, keyA), postKey(admin, "/api/v1/stock/issues", body, keyB)]);
    expect([left.status, right.status].sort()).toEqual([201, 409]);
    const winner = left.status === 201 ? left : right;
    const winnerKey = left.status === 201 ? keyA : keyB;
    expect(winner.body.issue.serials).toEqual([data.tickets[0].serial]);
    const retry = await postKey(admin, "/api/v1/stock/issues", body, winnerKey);
    expect(retry.status).toBe(200);
    expect(retry.body.issue.id).toBe(winner.body.issue.id);
    expect(await prisma.ticketCustody.count({ where: { ticketId: data.tickets[0].id, releasedAt: null } })).toBe(1);
  });

  it("is idempotent on issue retries and provides serials for a future issue slip", async () => {
    const data = await fixture(2);
    const body = { eventId: data.eventId, sellerId, selection: { kind: "CATEGORY_QUANTITY", ticketTypeId: data.ticketTypeId, quantity: 1 } };
    const key = unique("issue-retry");
    const first = await postKey(admin, "/api/v1/stock/issues", body, key);
    const retry = await postKey(admin, "/api/v1/stock/issues", body, key);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.issue).toMatchObject({ slipReference: expect.stringMatching(/^ISSUE-/), seller: { id: sellerId }, issuer: { displayName: expect.any(String) }, quantity: 1, serials: [first.body.issue.serials[0]] });
    expect(await prisma.stockIssue.count({ where: { eventId: data.eventId } })).toBe(1);
    expect(await prisma.ticketCustody.count({ where: { stockIssue: { eventId: data.eventId } } })).toBe(1);
    const pdf = await admin.request(`/api/v1/stock/issues/${first.body.issue.id}/slip.pdf`);
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await prisma.auditLog.count({ where: { eventId: data.eventId, action: "stock.issue-slip.print" } })).toBe(1);
  });

  it("issues the exact ticket QR codes scanned without returning or auditing raw tokens", async () => {
    const data = await fixture(2);
    const ticket = data.tickets[1];
    const token = data.tokens.get(ticket.id)!;
    const result = await postKey(admin, "/api/v1/stock/issues", { eventId: data.eventId, sellerId, selection: { kind: "TOKENS", tokens: [token] } });
    expect(result.status).toBe(201);
    expect(result.body.issue.serials).toEqual([ticket.serial]);
    expect(JSON.stringify(result.body)).not.toContain(token);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { eventId: data.eventId, action: "stock.issue" } });
    expect(JSON.stringify(audit.summary)).not.toContain(token);
    expect(await prisma.ticketCustody.count({ where: { ticketId: ticket.id, releasedAt: null, sellerId } })).toBe(1);
  });

  it("blocks a seller from another seller's ticket and releases held custody atomically on sale", async () => {
    const data = await fixture(2);
    const other = await additionalSeller();
    const ticket = data.tickets[0];
    expect((await postKey(admin, "/api/v1/stock/issues", { eventId: data.eventId, sellerId: other.user.id, selection: { kind: "SERIALS", serials: [ticket.serial] } })).status).toBe(201);
    const denied = await postKey(seller, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token: data.tokens.get(ticket.id) }], customerName: "Amina", customerPhone: "0772 123 456", initialPayment: { amountUgx: 12_000, method: "CASH" } });
    expect(denied.status).toBe(409);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("AVAILABLE");

    expect((await postKey(admin, "/api/v1/stock/issues", { eventId: data.eventId, sellerId, selection: { kind: "SERIALS", serials: [data.tickets[1].serial] } })).status).toBe(201);
    const ownedSale = await postKey(seller, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token: data.tokens.get(data.tickets[1].id) }], customerName: "Amina", customerPhone: "0772 123 456", initialPayment: { amountUgx: 12_000, method: "CASH" } });
    expect(ownedSale.status).toBe(201);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: data.tickets[1].id } })).toMatchObject({ status: "SOLD" });
    expect(await prisma.ticketCustody.findFirstOrThrow({ where: { ticketId: data.tickets[1].id } })).toMatchObject({ sellerId, releaseReason: "SOLD", releasedById: sellerId });
  });

  it("allows supervisor scan sale outside custody with an audit record, but keeps verifier denied", async () => {
    const data = await fixture(1);
    const token = data.tokens.get(data.tickets[0].id)!;
    const denied = await postKey(verifier, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token }], initialPayment: { amountUgx: 12_000, method: "CASH" } });
    expect(denied.status).toBe(403);
    const sold = await postKey(supervisor, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token }], initialPayment: { amountUgx: 12_000, method: "CASH" } });
    expect(sold.status).toBe(201);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { action: "stock.sale.override", targetId: sold.body.sale.id } })).toMatchObject({ actorRole: "SUPERVISOR" });
  });

  it("returns and marks lost stock, reconciles statement totals, and reverses remittance append-only", async () => {
    const data = await fixture(3);
    const [sold, returned, lost] = data.tickets;
    expect((await postKey(admin, "/api/v1/stock/issues", { eventId: data.eventId, sellerId, selection: { kind: "SERIALS", serials: data.tickets.map((ticket) => ticket.serial) } })).status).toBe(201);
    const sale = await postKey(seller, "/api/v1/sales", { eventId: data.eventId, tickets: [{ token: data.tokens.get(sold.id) }], initialPayment: { amountUgx: 12_000, method: "CASH" } });
    expect(sale.status).toBe(201);
    const returnBody = { eventId: data.eventId, sellerId, serials: [returned.serial], note: "Unused at end of shift" };
    const returnKey = unique("return-retry");
    const returnedResult = await postKey(admin, "/api/v1/stock/returns", returnBody, returnKey);
    expect(returnedResult.status).toBe(201);
    const returnRetry = await postKey(admin, "/api/v1/stock/returns", returnBody, returnKey);
    expect(returnRetry.status).toBe(200);
    expect(returnRetry.body.created).toBe(false);
    const lossReason = "Ticket was damaged; seller called 0772 123 456";
    const loss = await postKey(admin, "/api/v1/stock/losses", { eventId: data.eventId, sellerId, serials: [lost.serial], reason: lossReason });
    expect(loss.status).toBe(201);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: lost.id } })).toMatchObject({ status: "REVOKED", revokeReason: lossReason });
    const lossAudit = await prisma.auditLog.findFirstOrThrow({ where: { eventId: data.eventId, action: "stock.loss" } });
    expect(JSON.stringify(lossAudit.summary)).not.toContain("0772 123 456");
    expect(JSON.stringify(lossAudit.summary)).toContain("[REDACTED PHONE]");

    const receiverId = (await prisma.user.findUniqueOrThrow({ where: { username: "admin" } })).id;
    const remittanceBody = { eventId: data.eventId, sellerId, amountUgx: 5_000, method: "CASH", receivedById: receiverId, note: "Cash handover" };
    const remittanceKey = unique("remittance-retry");
    const remittance = await postKey(admin, "/api/v1/remittances", remittanceBody, remittanceKey);
    expect(remittance.status).toBe(201);
    const remittanceRetry = await postKey(admin, "/api/v1/remittances", remittanceBody, remittanceKey);
    expect(remittanceRetry.status).toBe(200);
    expect(remittanceRetry.body.created).toBe(false);
    const originalId = remittance.body.remittance.id as string;
    const reverseKey = unique("remittance-reverse");
    const reverse = await postKey(admin, `/api/v1/remittances/${originalId}/reverse`, { reason: "Handover entered in error" }, reverseKey);
    expect(reverse.status).toBe(201);
    expect(reverse.body.remittance.reversesId).toBe(originalId);
    const reverseRetry = await postKey(admin, `/api/v1/remittances/${originalId}/reverse`, { reason: "Handover entered in error" }, reverseKey);
    expect(reverseRetry.status).toBe(200);
    expect(reverseRetry.body.created).toBe(false);
    expect(await prisma.remittance.count({ where: { id: originalId } })).toBe(1);

    const statement = await seller.get(`/api/v1/stock/sellers/${sellerId}/statement?eventId=${data.eventId}`);
    expect(statement.status).toBe(200);
    expect(statement.body.stock).toMatchObject({ issued: 3, sold: 1, returned: 1, lost: 1, outstanding: 0, outstandingSerials: [] });
    expect(statement.body).toMatchObject({ takingsByMethodUgx: { CASH: 12_000 }, totalTakingsUgx: 12_000, remittedUgx: 0, balanceOwedUgx: 12_000 });
  });

  it("blocks close-out with outstanding serials then closes idempotently after disposition", async () => {
    const data = await fixture(1);
    const ticket = data.tickets[0];
    expect((await postKey(admin, "/api/v1/stock/issues", { eventId: data.eventId, sellerId, selection: { kind: "RANGE", serialFrom: ticket.serial, serialTo: ticket.serial } })).status).toBe(201);
    const blocked = await postKey(admin, `/api/v1/stock/sellers/${sellerId}/close-out`, { eventId: data.eventId });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain(ticket.serial);
    expect((await postKey(admin, "/api/v1/stock/returns", { eventId: data.eventId, sellerId, serials: [ticket.serial] })).status).toBe(201);
    const key = unique("closeout");
    const closed = await postKey(admin, `/api/v1/stock/sellers/${sellerId}/close-out`, { eventId: data.eventId }, key);
    const retry = await postKey(admin, `/api/v1/stock/sellers/${sellerId}/close-out`, { eventId: data.eventId }, key);
    expect(closed.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.closeout.id).toBe(closed.body.closeout.id);
  });

  it("supports unissued-only range and quantity selection and denies stock operations by role", async () => {
    const data = await fixture(3);
    const range = await postKey(admin, "/api/v1/stock/issues", { eventId: data.eventId, sellerId, selection: { kind: "RANGE", serialFrom: data.tickets[0].serial, serialTo: data.tickets[1].serial } });
    expect(range.status).toBe(201);
    expect(range.body.issue.serials).toHaveLength(2);
    const quantity = await postKey(admin, "/api/v1/stock/issues", { eventId: data.eventId, sellerId, selection: { kind: "CATEGORY_QUANTITY", ticketTypeId: data.ticketTypeId, quantity: 1 } });
    expect(quantity.status).toBe(201);
    expect(quantity.body.issue.serials).toEqual([data.tickets[2].serial]);
    expect((await postKey(seller, "/api/v1/stock/issues", { eventId: data.eventId, sellerId, selection: { kind: "SERIALS", serials: ["any"] } })).status).toBe(403);
    expect((await verifier.get(`/api/v1/stock/sellers/${sellerId}/statement?eventId=${data.eventId}`)).status).toBe(403);
    const issueId = range.body.issue.id as string;
    const firstSerial = data.tickets[0].serial;
    const returnBody = { eventId: data.eventId, sellerId, serials: [firstSerial] };
    const lossBody = { ...returnBody, reason: "Damaged" };
    const closeBody = { eventId: data.eventId };
    const receiverId = (await prisma.user.findUniqueOrThrow({ where: { username: "admin" } })).id;
    const remittance = await postKey(admin, "/api/v1/remittances", { eventId: data.eventId, sellerId, amountUgx: 100, method: "CASH", receivedById: receiverId });
    const remittanceId = remittance.body.remittance.id as string;
    for (const client of [seller, verifier, supervisor]) {
      expect((await postKey(client, "/api/v1/stock/issues", { eventId: data.eventId, sellerId, selection: { kind: "SERIALS", serials: [data.tickets[2].serial] } })).status).toBe(403);
      expect((await postKey(client, "/api/v1/stock/returns", returnBody)).status).toBe(403);
      expect((await postKey(client, "/api/v1/stock/losses", lossBody)).status).toBe(403);
      expect((await postKey(client, `/api/v1/stock/sellers/${sellerId}/close-out`, closeBody)).status).toBe(403);
      expect((await postKey(client, "/api/v1/remittances", { eventId: data.eventId, sellerId, amountUgx: 100, method: "CASH", receivedById: receiverId })).status).toBe(403);
      expect((await postKey(client, `/api/v1/remittances/${remittanceId}/reverse`, { reason: "Wrong entry" })).status).toBe(403);
      expect((await client.request(`/api/v1/stock/issues/${issueId}/slip.pdf`)).status).toBe(client === supervisor ? 200 : 403);
    }
  });
});
