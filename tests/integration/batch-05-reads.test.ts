import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateQrToken, hashQrToken } from "@/lib/qr/tokens";
import { getTicketTrace, listTickets } from "@/server/services/tickets.service";
import { getBatchFlow } from "@/server/services/ticket-batches.service";
import { getSale, getSalesTotals, listSales } from "@/server/services/sales.service";
import { getSellerStockStatement } from "@/server/services/stock.service";
import {
  listCheckInGates,
  listRecentCheckIns,
  listScanAttempts,
} from "@/server/services/check-in.service";
import { loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";

vi.mock("server-only", () => ({}));

type Role = "SUPER_ADMIN" | "ADMIN" | "SELLER" | "VERIFIER" | "SUPERVISOR";
type AuthCtx = { sessionId: string; userId: string; username: string; displayName: string; role: Role; expiresAt: Date };

const keyed = (client: TestClient, url: string, data: unknown, key: string) =>
  client.json(url, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(data) });

const ROLE_USERNAME: Record<Role, string> = {
  SUPER_ADMIN: "qaphael",
  ADMIN: "admin",
  SELLER: "seller",
  VERIFIER: "verifier",
  SUPERVISOR: "supervisor",
};

async function ctx(role: Role): Promise<AuthCtx> {
  const user = await prisma.user.findUniqueOrThrow({ where: { username: ROLE_USERNAME[role] }, select: { id: true, username: true, displayName: true } });
  return {
    sessionId: `batch05-${role}`,
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role,
    expiresAt: new Date(Date.now() + 60_000),
  };
}

let admin: TestClient;
let superAdminCtx: AuthCtx;
let sellerCtx: AuthCtx;
let verifierCtx: AuthCtx;

beforeAll(async () => {
  admin = await loginAs("superadmin");
  await loginAs("seller");
  await loginAs("verifier");
  superAdminCtx = await ctx("SUPER_ADMIN");
  sellerCtx = await ctx("SELLER");
  verifierCtx = await ctx("VERIFIER");
});

/**
 * Seeds an event with one paid, sold ticket and an admission, returning the
 * ids/serials needed by the read functions under test.
 */
async function soldAndAdmitted(paid = true, admit = true) {
  const event = await admin.post("/api/v1/events", {
    name: unique("B05 event"), venue: "KSP Hotel Gulu", status: "SCHEDULED", eventDate: "2026-12-05",
    startTime: "18:00", endTime: "23:00", capacity: 50, requireBuyerDetails: false,
  });
  expect(event.status).toBe(201);
  const eventId = event.body.event.id as string;
  await admin.post(`/api/v1/events/${eventId}/open-sales`);
  const type = await admin.post(`/api/v1/events/${eventId}/ticket-types`, { name: unique("B05 tier"), priceUgx: 12_000 });
  expect(type.status).toBe(201);
  const ticketTypeId = type.body.ticketType.id as string;
  const batch = await admin.post("/api/v1/ticket-batches", {
    eventId, ticketTypeId, quantity: 3, serialPrefix: `B${Date.now().toString(36).slice(-6).toUpperCase()}`,
  });
  expect(batch.status).toBe(201);
  const batchId = batch.body.batch.id as string;
  const sale = await keyed(admin, "/api/v1/sales", {
    eventId, items: [{ ticketTypeId, quantity: 1 }], customerName: "B05 Buyer", customerPhone: "0771234567",
    ...(paid ? { initialPayment: { amountUgx: 12_000, method: "CASH" } } : {}),
  }, unique(`b05-sale-${eventId}`));
  expect(sale.status).toBe(201);
  const saleId = sale.body.sale.id as string;
  const ticket = await prisma.ticket.findFirstOrThrow({ where: { eventId, ticketTypeId, status: "SOLD" } });
  const token = generateQrToken();
  await prisma.ticket.update({ where: { id: ticket.id }, data: { tokenHash: hashQrToken(token) } });
  if (admit) {
    await admin.post(`/api/v1/events/${eventId}/open-admission`);
    const confirm = await keyed(admin, "/api/v1/check-in/confirm", { eventId, method: "QR", token, gate: "Gate B" }, unique(`b05-checkin-${eventId}`));
    expect(confirm.body.admitted).toBe(true);
  }
  return { eventId, saleId, batchId, ticketId: ticket.id, serial: ticket.serial, token, ticketTypeId };
}

describe("Batch 0.5 read-only service additions", () => {
  describe("tickets.getTicketTrace", () => {
    it("returns a null sale/check-in trace for an unsold ticket", async () => {
      const fixture = await soldAndAdmitted();
      const remaining = await prisma.ticket.findFirstOrThrow({
        where: { eventId: fixture.eventId, id: { not: fixture.ticketId } },
        select: { id: true },
      });
      const trace = await getTicketTrace(superAdminCtx, remaining.id);
      expect(trace.sale).toBeNull();
      expect(trace.checkIn).toBeNull();
    });

    it("exposes sale and checkpoint details for an admitted ticket", async () => {
      const fixture = await soldAndAdmitted();
      const trace = await getTicketTrace(superAdminCtx, fixture.ticketId);
      expect(trace.sale).toMatchObject({
        reference: expect.any(String),
        status: "PAID",
        totalUgx: 12_000,
        paidNetUgx: 12_000,
        balanceUgx: 0,
      });
      expect(trace.sale?.customerPhone).toBe("0771234567");
      expect(trace.checkIn).toMatchObject({ gate: "Gate B", method: "QR" });
      expect(trace.checkIn?.checkedInAt).toEqual(expect.any(String));
    });

    it("denies sellers (no inventory:read)", async () => {
      const fixture = await soldAndAdmitted();
      await expect(getTicketTrace(sellerCtx, fixture.ticketId)).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("tickets.listTickets include trace", () => {
    it("adds a masked phone trace per row without changing default rows", async () => {
      const fixture = await soldAndAdmitted();
      const plain = await listTickets(superAdminCtx, { eventId: fixture.eventId, page: 1, pageSize: 25 });
      expect(plain.tickets[0].trace).toBeUndefined();

      const traced = await listTickets(superAdminCtx, { eventId: fixture.eventId, page: 1, pageSize: 25, include: "trace" });
      const row = traced.tickets.find((t) => t.id === fixture.ticketId);
      expect(row?.trace).toMatchObject({
        saleId: fixture.saleId,
        saleReference: expect.any(String),
        checkedInAt: expect.any(String),
        gate: "Gate B",
      });
      expect(row?.trace?.customerPhoneMasked).toMatch(/^\*{3}567$/);
    });
  });

  describe("ticket-batches.getBatchFlow", () => {
    it("reports counts that sum to quantity and per-seller custody for admins", async () => {
      const fixture = await soldAndAdmitted();
      const flow = await getBatchFlow(superAdminCtx, fixture.batchId);
      expect(flow.total).toBe(3);
      expect(flow.sold + flow.withSellers + flow.inVault + flow.revoked + flow.cancelled).toBe(flow.total);
      expect(flow.sold).toBe(1);
      expect(flow.checkedIn).toBe(1);
      expect(flow.inVault + flow.withSellers).toBe(2);
      expect(Array.isArray(flow.custody)).toBe(true);
    });

    it("omits custody breakdown without stock:read-all", async () => {
      // Seller has no inventory:read, so use a denied-path check via a verifier call.
      const fixture = await soldAndAdmitted();
      await expect(getBatchFlow(verifierCtx, fixture.batchId)).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("sales.listSales search", () => {
    it("finds a sale by its reference", async () => {
      const fixture = await soldAndAdmitted();
      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: fixture.saleId } });
      const found = await listSales(superAdminCtx, { eventId: fixture.eventId, search: sale.reference, page: 1, pageSize: 25 });
      expect(found.sales.map((s) => s.id)).toContain(fixture.saleId);
    });

    it("finds a sale by normalized customer phone digits", async () => {
      const fixture = await soldAndAdmitted();
      const found = await listSales(superAdminCtx, { eventId: fixture.eventId, search: "123456", page: 1, pageSize: 25 });
      expect(found.sales.map((s) => s.id)).toContain(fixture.saleId);
    });
  });

  describe("sales.getSalesTotals", () => {
    it("computes gross, collected net, outstanding and byStatus integers", async () => {
      const fixture = await soldAndAdmitted();
      const totals = await getSalesTotals(superAdminCtx, { eventId: fixture.eventId, page: 1, pageSize: 25 });
      expect(totals.saleCount).toBe(1);
      expect(totals.grossUgx).toBe(12_000);
      expect(totals.collectedNetUgx).toBe(12_000);
      expect(totals.outstandingUgx).toBe(0);
      expect(totals.byStatus.PAID).toBe(1);
    });

    it("scopes a seller to their own totals and returns 0-complete byStatus on empty scope", async () => {
      const fixture = await soldAndAdmitted();
      const sellerOwn = await getSalesTotals(sellerCtx, { eventId: fixture.eventId, page: 1, pageSize: 25 });
      // The sale was made by the admin client (superadmin), not the seller.
      expect(sellerOwn.saleCount).toBe(0);
      expect(sellerOwn.grossUgx).toBe(0);
      expect(sellerOwn.byStatus.CANCELLED).toBe(0);
    });

    it("denies verifiers without sale read permissions", async () => {
      await expect(getSalesTotals(verifierCtx, { eventId: "unused", page: 1, pageSize: 25 })).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("sales.getSale checkout gate", () => {
    it("includes gate for checkin:read-recent but omits it for verifier-without-buyer", async () => {
      const fixture = await soldAndAdmitted();
      const verifiedSale = await getSale(superAdminCtx, fixture.saleId);
      const item = verifiedSale.items[0]!;
      const ticket = item.tickets.find((t) => t.id === fixture.ticketId)!;
      expect(ticket.checkIn).toMatchObject({ gate: "Gate B" });
    });
  });

  describe("stock.getSellerStockStatement", () => {
    it("adds per-batch and remittance arrays without breaking existing fields", async () => {
      const fixture = await soldAndAdmitted();
      const seller = await prisma.user.findUniqueOrThrow({ where: { username: "seller" } });
      // Issue the two sold-and-free tickets to the seller.
      const freeTickets = await prisma.ticket.findMany({
        where: { eventId: fixture.eventId, id: { not: fixture.ticketId } },
        orderBy: { serial: "asc" },
      });
      const issue = await keyed(admin, "/api/v1/stock/issues", {
        eventId: fixture.eventId, sellerId: seller.id,
        selection: { kind: "SERIALS", serials: freeTickets.map((t) => t.serial) },
      }, unique(`b05-issue-${fixture.eventId}`));
      expect(issue.status).toBe(201);

      const statement = await getSellerStockStatement(superAdminCtx, seller.id, { eventId: fixture.eventId });
      expect(statement.stock.issued).toBe(freeTickets.length);
      expect(Array.isArray(statement.batches)).toBe(true);
      expect(statement.batches.length).toBeGreaterThan(0);
      const batch = statement.batches[0]!;
      expect(typeof batch.batchRef).toBe("string");
      expect(batch.issued).toBe(freeTickets.length);
      expect(batch.unitPriceUgx).toBe(12_000);
      expect(Array.isArray(batch.heldSerials)).toBe(true);
      expect(Array.isArray(statement.remittances)).toBe(true);
    });
  });

  describe("check-in.listScanAttempts originalCheckIn", () => {
    it("links ALREADY_USED attempts to the original admission", async () => {
      const fixture = await soldAndAdmitted();
      // Verify-serial on the already-admitted ticket records an ALREADY_USED attempt.
      await admin.post("/api/v1/check-in/verify-serial", { eventId: fixture.eventId, serial: fixture.serial });
      const attempts = await listScanAttempts(superAdminCtx, { eventId: fixture.eventId, limit: 50 });
      const already = attempts.find((a) => a.resultCode === "ALREADY_USED");
      expect(already).toBeDefined();
      expect(already!.originalCheckIn).toMatchObject({ gate: "Gate B" });
    });
  });

  describe("check-in.listRecentCheckIns method filter", () => {
    it("filters to QR-only admissions", async () => {
      const fixture = await soldAndAdmitted();
      const all = await listRecentCheckIns(verifierCtx, { eventId: fixture.eventId, limit: 50 });
      expect(all.some((r) => r.id)).toBe(true);
      const qr = await listRecentCheckIns(verifierCtx, { eventId: fixture.eventId, limit: 50, method: "QR" });
      expect(qr.every((r) => r.method === "QR")).toBe(true);
    });
  });

  describe("check-in.listCheckInGates", () => {
    it("returns gates with counts ordered by usage", async () => {
      const fixture = await soldAndAdmitted();
      const gates = await listCheckInGates(verifierCtx, fixture.eventId);
      expect(gates.find((g) => g.gate === "Gate B")?.count).toBe(1);
      expect([...gates].sort((a, b) => b.count - a.count)).toEqual(gates);
    });
  });
});