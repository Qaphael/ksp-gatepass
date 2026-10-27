import { beforeAll, describe, expect, it } from "vitest";
import { loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";

let admin: TestClient; let seller: TestClient; let supervisor: TestClient;
beforeAll(async () => { [admin, seller, supervisor] = await Promise.all([loginAs("admin"), loginAs("seller"), loginAs("supervisor")]); });
const postKey = (client: TestClient, url: string, data: unknown, key: string) => client.json(url, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(data) });

async function fixture() {
  const event = await admin.post("/api/v1/events", { name: unique("Report event"), venue: "KSP Hotel Gulu", status: "SCHEDULED", eventDate: "2026-12-05", startTime: "18:00", endTime: "23:00", capacity: 100 });
  const eventId = event.body.event.id as string;
  await admin.post(`/api/v1/events/${eventId}/open-sales`);
  const type = await admin.post(`/api/v1/events/${eventId}/ticket-types`, { name: unique("General"), priceUgx: 12_000 });
  const ticketTypeId = type.body.ticketType.id as string;
  await admin.post("/api/v1/ticket-batches", { eventId, ticketTypeId, quantity: 5, serialPrefix: `R${Date.now().toString(36).slice(-6).toUpperCase()}` });
  const ownSale = await postKey(seller, "/api/v1/sales", { eventId, items: [{ ticketTypeId, quantity: 2 }], initialPayment: { amountUgx: 12_000, method: "CASH" } }, unique("report-own"));
  const otherSale = await postKey(admin, "/api/v1/sales", { eventId, items: [{ ticketTypeId, quantity: 1 }], initialPayment: { amountUgx: 12_000, method: "MOBILE_MONEY" } }, unique("report-other"));
  expect(ownSale.status).toBe(201); expect(otherSale.status).toBe(201);
  return { eventId, ticketTypeId, ownSale: ownSale.body.sale, otherSale: otherSale.body.sale };
}

describe("reports, audit search and hardening", () => {
  it("computes server-backed event summaries and restricts seller reports to their own sales", async () => {
    const { eventId } = await fixture();
    const reportTypes = ["TICKET_INVENTORY", "SALES_BY_CATEGORY", "SALES_BY_SELLER", "SALES_BY_DATE", "PAYMENTS_BY_METHOD", "OUTSTANDING_BALANCES", "CANCELLATIONS_REFUNDS", "PRINT_HISTORY", "ATTENDANCE_BY_GATE", "SCAN_ATTEMPTS", "SOLD_NOT_CHECKED_IN", "RECONCILIATION"];
    for (const type of reportTypes) expect((await admin.get(`/api/v1/reports?eventId=${eventId}&type=${type}`)).status, type).toBe(200);
    const summary = await admin.get(`/api/v1/reports?eventId=${eventId}&type=RECONCILIATION`);
    expect(summary.status).toBe(200);
    const rows = summary.body.rows as Array<[string, number | string]>;
    expect(rows.find(([label]) => label === "Gross sales value (UGX)")?.[1]).toBe(36_000);
    expect(rows.find(([label]) => label === "Payments recorded by staff (UGX)")?.[1]).toBe(24_000);
    expect(rows.find(([label]) => label === "Outstanding balances (UGX)")?.[1]).toBe(12_000);
    expect(rows.find(([label]) => label === "Actual cash counted (UGX)")?.[1]).toBe("Not recorded");

    const sellerOwn = await seller.get(`/api/v1/reports?eventId=${eventId}&type=OUTSTANDING_BALANCES`);
    expect(sellerOwn.status).toBe(200);
    expect(JSON.stringify(sellerOwn.body)).toContain((await prisma.sale.findFirstOrThrow({ where: { eventId, sellerId: (await prisma.user.findUniqueOrThrow({ where: { username: "seller" } })).id } })).reference);
    expect((await seller.get(`/api/v1/reports?eventId=${eventId}&type=SALES_BY_SELLER`)).status).toBe(403);
    expect((await supervisor.get(`/api/v1/reports?eventId=${eventId}&type=RECONCILIATION`)).status).toBe(200);
    expect((await supervisor.get(`/api/v1/reports?eventId=${eventId}&type=OUTSTANDING_BALANCES`)).status).toBe(403);
  });

  it("exports CSV and PDF, records the export, and provides searchable admin audit history", async () => {
    const { eventId } = await fixture();
    const csv = await admin.request(`/api/v1/reports/export?eventId=${eventId}&type=SALES_BY_CATEGORY&format=csv`);
    expect(csv.status).toBe(200); expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("Net sales UGX");
    const pdf = await admin.request(`/api/v1/reports/export?eventId=${eventId}&type=RECONCILIATION&format=pdf`);
    expect(pdf.status).toBe(200); expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    const audit = await admin.get(`/api/v1/audit-logs?eventId=${eventId}&action=report.export&q=RECONCILIATION`);
    expect(audit.status).toBe(200); expect(audit.body.total).toBeGreaterThanOrEqual(1);
    expect((await seller.get("/api/v1/audit-logs")).status).toBe(403);
  });

  it("rejects cross-origin writes and sends browser security headers", async () => {
    const denied = await admin.json("/api/v1/events", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://attacker.example" }, body: JSON.stringify({}) });
    expect(denied.status).toBe(403);
    const proxiedOrigin = await admin.json("/api/v1/events", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://127.0.0.1:3100", "X-Forwarded-Proto": "https" }, body: JSON.stringify({}) });
    expect(proxiedOrigin.status).toBe(422); // Same public origin is accepted behind the HTTPS terminator.
    const events = await admin.get("/api/v1/events");
    expect(events.headers.get("x-content-type-options")).toBe("nosniff");
    expect(events.headers.get("x-frame-options")).toBe("DENY");
    expect(events.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});
