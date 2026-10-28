import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDailyAdmissionCount, getSellerDashboardMetrics, getTicketTypeProgress } from "@/server/services/dashboard.service";
import { loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";

vi.mock("server-only", () => ({}));

type DashboardContext = { sessionId: string; userId: string; username: string; displayName: string; role: "SELLER"; expiresAt: Date };
type VerifierContext = Omit<DashboardContext, "role"> & { role: "VERIFIER" };

let admin: TestClient;
let verifierClient: TestClient;
let sellerCtx: DashboardContext;
let verifierCtx: VerifierContext;

beforeAll(async () => {
  admin = await loginAs("admin");
  await loginAs("seller");
  const seller = await prisma.user.findUniqueOrThrow({ where: { username: "seller" } });
  sellerCtx = { sessionId: "dashboard-test", userId: seller.id, username: seller.username, displayName: seller.displayName, role: "SELLER", expiresAt: new Date(Date.now() + 60_000) };
  verifierClient = await loginAs("verifier");
  const verifier = await prisma.user.findUniqueOrThrow({ where: { username: "verifier" } });
  verifierCtx = { sessionId: "dashboard-verifier-test", userId: verifier.id, username: verifier.username, displayName: verifier.displayName, role: "VERIFIER", expiresAt: new Date(Date.now() + 60_000) };
});

describe("role dashboard metrics", () => {
  it("computes seller totals from own server-side sales and payments", async () => {
    const created = await admin.post("/api/v1/events", {
      name: unique("Dashboard event"), venue: "KSP Hotel Gulu", status: "SCHEDULED", eventDate: "2026-12-05",
      startTime: "18:00", endTime: "23:00", capacity: 20,
    });
    expect(created.status).toBe(201);
    const eventId = created.body.event.id as string;
    await admin.post(`/api/v1/events/${eventId}/open-sales`);
    const type = await admin.post(`/api/v1/events/${eventId}/ticket-types`, { name: unique("Dashboard category"), priceUgx: 12_000, allocationLimit: 5 });
    expect(type.status).toBe(201);
    const ticketTypeId = type.body.ticketType.id as string;
    const batch = await admin.post("/api/v1/ticket-batches", { eventId, ticketTypeId, quantity: 4, serialPrefix: `D${Date.now().toString(36).slice(-6).toUpperCase()}` });
    expect(batch.status).toBe(201);
    const seller = await loginAs("seller");
    const sale = await seller.json("/api/v1/sales", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": unique("dashboard-sale") },
      body: JSON.stringify({ eventId, items: [{ ticketTypeId, quantity: 2 }], initialPayment: { amountUgx: 12_000, method: "CASH" } }),
    });
    expect(sale.status).toBe(201);

    const [metrics, progress, verifierDaily] = await Promise.all([
      getSellerDashboardMetrics(sellerCtx, eventId),
      getTicketTypeProgress(sellerCtx, eventId),
      getDailyAdmissionCount(verifierCtx, eventId),
    ]);
    expect(metrics.salesCount).toBe(1);
    expect(metrics.salesValueUgx).toBe(24_000);
    expect(metrics.receivedNetUgx).toBe(12_000);
    expect(metrics.outstandingUgx).toBe(12_000);
    expect(progress).toEqual([{ id: ticketTypeId, name: type.body.ticketType.name, sold: 2, remaining: 3, total: 5 }]);
    expect(verifierDaily.count).toBe(0);
    expect((await verifierClient.get(`/api/v1/scan-attempts?eventId=${eventId}&limit=5`)).status).toBe(200);
  });
});
