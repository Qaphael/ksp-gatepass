import { beforeAll, describe, expect, it } from "vitest";
import { loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";

let admin: TestClient;
let seller: TestClient;

beforeAll(async () => {
  admin = await loginAs("admin");
  seller = await loginAs("seller");
});

async function fixture(quantity = 8) {
  const event = await admin.post("/api/v1/events", {
    name: unique("Sales Event"), venue: "KSP Hotel Gulu", status: "SCHEDULED", eventDate: "2026-12-05",
    startTime: "18:00", endTime: "23:00", capacity: 100,
  });
  expect(event.status).toBe(201);
  const eventId = event.body.event.id as string;
  const open = await admin.post(`/api/v1/events/${eventId}/open-sales`);
  expect(open.status).toBe(200);
  const first = await admin.post(`/api/v1/events/${eventId}/ticket-types`, { name: unique("General"), priceUgx: 12_000 });
  const second = await admin.post(`/api/v1/events/${eventId}/ticket-types`, { name: unique("VIP"), priceUgx: 25_000 });
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const batch = await admin.post("/api/v1/ticket-batches", {
    eventId, ticketTypeId: first.body.ticketType.id, quantity,
    serialPrefix: `S${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`.toUpperCase(),
  });
  expect(batch.status).toBe(201);
  const vipBatch = await admin.post("/api/v1/ticket-batches", {
    eventId, ticketTypeId: second.body.ticketType.id, quantity: 3,
    serialPrefix: `V${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`.toUpperCase(),
  });
  expect(vipBatch.status).toBe(201);
  return { eventId, generalId: first.body.ticketType.id as string, vipId: second.body.ticketType.id as string };
}

function postWithKey(client: TestClient, url: string, body: unknown, key: string) {
  return client.json(url, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

describe("sales and payment tracking", () => {
  it("uses server prices for multiple categories and records partial then full payment", async () => {
    const { eventId, generalId, vipId } = await fixture();
    const key = unique("sale-key");
    const body = {
      eventId, customerName: "Guest", items: [{ ticketTypeId: generalId, quantity: 1 }, { ticketTypeId: vipId, quantity: 1 }],
      initialPayment: { amountUgx: 10_000, method: "CASH" },
    };
    const created = await postWithKey(seller, "/api/v1/sales", body, key);
    expect(created.status).toBe(201);
    expect(created.body.sale.subtotalUgx).toBe(37_000);
    expect(created.body.sale.totalUgx).toBe(37_000);
    expect(created.body.sale.amountPaidUgx).toBe(10_000);
    expect(created.body.sale.balanceUgx).toBe(27_000);
    expect(created.body.sale.status).toBe("PARTIALLY_PAID");
    expect(created.body.sale.items).toHaveLength(2);
    expect(created.body.sale.items.every((item: { tickets: unknown[] }) => item.tickets.length === 1)).toBe(true);

    const paymentKey = unique("payment-key");
    const paymentBody = { amountUgx: 20_000, method: "MOBILE_MONEY", externalRef: "TX-123" };
    const recorded = await postWithKey(seller, `/api/v1/sales/${created.body.sale.id}/payments`, paymentBody, paymentKey);
    expect(recorded.status).toBe(201);
    expect(recorded.body.sale.balanceUgx).toBe(7_000);
    expect(recorded.body.sale.status).toBe("PARTIALLY_PAID");
    const retry = await postWithKey(seller, `/api/v1/sales/${created.body.sale.id}/payments`, paymentBody, paymentKey);
    expect(retry.status).toBe(200);
    expect(retry.body.sale.payments).toHaveLength(2);
    const final = await postWithKey(seller, `/api/v1/sales/${created.body.sale.id}/payments`, { amountUgx: 7_000, method: "CASH" }, unique("final-payment"));
    expect(final.status).toBe(201);
    expect(final.body.sale.status).toBe("PAID");
    expect(final.body.sale.balanceUgx).toBe(0);
    expect(await prisma.payment.count({ where: { saleId: created.body.sale.id } })).toBe(3);
  });

  it("rejects browser prices, discounts and overpayment", async () => {
    const { eventId, generalId } = await fixture();
    const forged = await seller.post("/api/v1/sales", {
      eventId, items: [{ ticketTypeId: generalId, quantity: 1, unitPriceUgx: 1 }],
    });
    expect(forged.status).toBe(422);
    const discounted = await seller.post("/api/v1/sales", {
      eventId, discountUgx: 1, items: [{ ticketTypeId: generalId, quantity: 1 }],
    });
    expect(discounted.status).toBe(422);
    const overpaid = await postWithKey(seller, "/api/v1/sales", {
      eventId, items: [{ ticketTypeId: generalId, quantity: 1 }],
      initialPayment: { amountUgx: 12_001, method: "CASH" },
    }, unique("overpaid"));
    expect(overpaid.status).toBe(409);
    expect(await prisma.sale.count({ where: { eventId } })).toBe(0);
  });

  it("returns the same sale for an idempotent retry and blocks a changed payload", async () => {
    const { eventId, generalId } = await fixture();
    const key = unique("same-sale");
    const body = { eventId, items: [{ ticketTypeId: generalId, quantity: 1 }] };
    const first = await postWithKey(seller, "/api/v1/sales", body, key);
    const retry = await postWithKey(seller, "/api/v1/sales", body, key);
    const changed = await postWithKey(seller, "/api/v1/sales", { ...body, customerName: "Different" }, key);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.sale.id).toBe(first.body.sale.id);
    expect(changed.status).toBe(409);
    expect(await prisma.sale.count({ where: { eventId } })).toBe(1);
  });

  it("allows discounts only to an administrator with a reason and records the actor", async () => {
    const { eventId, generalId } = await fixture();
    const body = { eventId, items: [{ ticketTypeId: generalId, quantity: 1 }], discountUgx: 2_000, discountReason: "Approved promotion" };
    const sellerAttempt = await postWithKey(seller, "/api/v1/sales", body, unique("seller-discount"));
    expect(sellerAttempt.status).toBe(403);
    const adminSale = await postWithKey(admin, "/api/v1/sales", body, unique("admin-discount"));
    expect(adminSale.status).toBe(201);
    expect(adminSale.body.sale.subtotalUgx).toBe(12_000);
    expect(adminSale.body.sale.discountUgx).toBe(2_000);
    expect(adminSale.body.sale.totalUgx).toBe(10_000);
    const stored = await prisma.sale.findUniqueOrThrow({ where: { id: adminSale.body.sale.id } });
    expect(stored.discountReason).toBe("Approved promotion");
    expect(stored.discountedById).toBeTruthy();
  });

  it("serializes concurrent sales so tickets cannot be allocated twice or oversold", async () => {
    const { eventId, generalId } = await fixture(2);
    const create = (key: string) => postWithKey(seller, "/api/v1/sales", {
      eventId, items: [{ ticketTypeId: generalId, quantity: 2 }],
    }, key);
    const results = await Promise.all([create(unique("race-a")), create(unique("race-b"))]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const allocations = await prisma.saleTicket.findMany({ where: { sale: { eventId } } });
    expect(allocations).toHaveLength(2);
    expect(new Set(allocations.map((row) => row.ticketId)).size).toBe(2);
  });

  it("records reversals as linked adjustments instead of editing payment amounts", async () => {
    const { eventId, generalId } = await fixture();
    const sale = await postWithKey(admin, "/api/v1/sales", {
      eventId, items: [{ ticketTypeId: generalId, quantity: 1 }],
      initialPayment: { amountUgx: 12_000, method: "CASH" },
    }, unique("reversible-sale"));
    expect(sale.status).toBe(201);
    const paymentBefore = await prisma.payment.findFirstOrThrow({ where: { saleId: sale.body.sale.id } });
    const reversed = await postWithKey(admin, `/api/v1/payments/${paymentBefore.id}/reverse`, { reason: "Entered in error" }, unique("reverse-key"));
    expect(reversed.status).toBe(201);
    expect(reversed.body.sale.status).toBe("PENDING_PAYMENT");
    const paymentAfter = await prisma.payment.findUniqueOrThrow({ where: { id: paymentBefore.id }, include: { adjustments: true } });
    expect(paymentAfter.amountUgx).toBe(12_000);
    expect(paymentAfter.status).toBe("REVERSED");
    expect(paymentAfter.adjustments).toHaveLength(1);
    expect(paymentAfter.adjustments[0].type).toBe("REVERSAL");
  });

  it("serializes concurrent retries for the same payment and reversal key", async () => {
    const { eventId, generalId } = await fixture();
    const sale = await postWithKey(seller, "/api/v1/sales", { eventId, items: [{ ticketTypeId: generalId, quantity: 1 }] }, unique("retry-sale"));
    expect(sale.status).toBe(201);
    const paymentKey = unique("concurrent-payment");
    const paymentBody = { amountUgx: 5_000, method: "CASH" };
    const payments = await Promise.all([
      postWithKey(seller, `/api/v1/sales/${sale.body.sale.id}/payments`, paymentBody, paymentKey),
      postWithKey(seller, `/api/v1/sales/${sale.body.sale.id}/payments`, paymentBody, paymentKey),
    ]);
    expect(payments.map((result) => result.status).sort()).toEqual([200, 201]);
    const paymentId = payments[0].body.sale.payments[0].id as string;
    const adjustmentKey = unique("concurrent-reversal");
    const adjustmentBody = { reason: "Duplicate entry" };
    const adjustments = await Promise.all([
      postWithKey(admin, `/api/v1/payments/${paymentId}/reverse`, adjustmentBody, adjustmentKey),
      postWithKey(admin, `/api/v1/payments/${paymentId}/reverse`, adjustmentBody, adjustmentKey),
    ]);
    expect(adjustments.map((result) => result.status).sort()).toEqual([200, 201]);
    expect(await prisma.paymentAdjustment.count({ where: { paymentId } })).toBe(1);
  });

  it("blocks cancellation after event admission has ever opened", async () => {
    const { eventId, generalId } = await fixture();
    const sale = await postWithKey(admin, "/api/v1/sales", {
      eventId, items: [{ ticketTypeId: generalId, quantity: 1 }],
    }, unique("admission-guard"));
    expect(sale.status).toBe(201);
    const opened = await admin.post(`/api/v1/events/${eventId}/open-admission`);
    expect(opened.status).toBe(200);
    const cancelled = await admin.post(`/api/v1/sales/${sale.body.sale.id}/cancel`, { reason: "Test attempt" });
    expect(cancelled.status).toBe(409);
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.body.sale.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("refunds by appending linked adjustments and blocks sellers from another seller's sale", async () => {
    const { eventId, generalId } = await fixture();
    const sale = await postWithKey(admin, "/api/v1/sales", {
      eventId, items: [{ ticketTypeId: generalId, quantity: 1 }],
      initialPayment: { amountUgx: 12_000, method: "CASH" },
    }, unique("refundable-sale"));
    expect(sale.status).toBe(201);
    const hidden = await seller.get(`/api/v1/sales/${sale.body.sale.id}`);
    expect(hidden.status).toBe(404);
    const response = await postWithKey(admin, `/api/v1/sales/${sale.body.sale.id}/refund`, { reason: "Customer cancellation" }, unique("refund-key"));
    expect(response.status).toBe(201);
    expect(response.body.sale.status).toBe("REFUNDED");
    expect(response.body.sale.balanceUgx).toBe(12_000);
    expect(response.body.sale.payments).toHaveLength(1);
    expect(response.body.sale.payments[0].adjustments).toHaveLength(1);
    expect(await prisma.payment.count({ where: { saleId: sale.body.sale.id } })).toBe(1);
    expect(await prisma.paymentAdjustment.count({ where: { payment: { saleId: sale.body.sale.id } } })).toBe(1);
    expect(await prisma.ticket.count({ where: { saleTickets: { some: { saleId: sale.body.sale.id } }, status: "CANCELLED" } })).toBe(1);
  });
});
