import "dotenv/config";
import { randomBytes } from "node:crypto";
import type { Role } from "../src/generated/prisma/client";
import type { AuthContext } from "../src/lib/auth/session";
import { decryptToken } from "../src/lib/qr/token-vault";
import { normalizeUgandaPhone } from "../src/lib/phone/uganda";
import { prisma } from "../src/lib/db/client";
import { createEventSchema } from "../src/lib/validation/events";
import { createTicketTypeSchema } from "../src/lib/validation/ticket-types";
import { generateBatchSchema } from "../src/lib/validation/tickets";
import { saleCreateSchema } from "../src/lib/validation/sales";
import { stockIssueSchema, stockLossSchema, stockReturnSchema, remittanceCreateSchema } from "../src/lib/validation/stock";
import { createEvent, openSales } from "../src/server/services/events.service";
import { createTicketType } from "../src/server/services/ticket-types.service";
import { generateBatch } from "../src/server/services/ticket-batches.service";
import { createSale } from "../src/server/services/sales.service";
import { issueStock, markStockLost, recordRemittance, returnStock } from "../src/server/services/stock.service";

const CONFIRMATION = "YES_I_WILL_USE_A_DEVELOPMENT_DATABASE";
const ALLOWED_DATABASES = new Set(["ksp_gatepass", "ksp_gatepass_dev"]);
const DISTRIBUTION = [
  { issued: 34, sold: 25, returned: 7, lost: 2 },
  { issued: 33, sold: 20, returned: 10, lost: 3 },
  { issued: 33, sold: 15, returned: 14, lost: 4 },
] as const;

function assertDevelopmentTarget() {
  if (process.env.NODE_ENV === "production") throw new Error("Rehearsal seed is disabled when NODE_ENV=production.");
  if (process.env.KSP_REHEARSAL_SEED_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set KSP_REHEARSAL_SEED_CONFIRM=${CONFIRMATION} to explicitly enable rehearsal seeding.`);
  }
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required.");
  const databaseUrl = new URL(rawDatabaseUrl);
  const hostname = databaseUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)) {
    throw new Error("Rehearsal seed only connects to a local development database.");
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (!ALLOWED_DATABASES.has(databaseName)) {
    throw new Error("Rehearsal seed only allows the local ksp_gatepass or ksp_gatepass_dev database.");
  }
  const runId = process.env.KSP_REHEARSAL_RUN_ID?.trim().toLowerCase();
  if (!runId || !/^[a-z0-9][a-z0-9-]{2,19}$/.test(runId)) {
    throw new Error("Set KSP_REHEARSAL_RUN_ID to a unique 3–20 character lowercase label (letters, numbers and dashes)." );
  }
  const sellerUsernames = process.env.KSP_REHEARSAL_SELLERS?.split(",").map((username) => username.trim().toLowerCase()).filter(Boolean) ?? [];
  if (sellerUsernames.length !== 3 || new Set(sellerUsernames).size !== 3) {
    throw new Error("Set KSP_REHEARSAL_SELLERS to exactly three distinct active development seller usernames.");
  }
  const testPhone = process.env.KSP_REHEARSAL_TEST_PHONE?.trim();
  if (!testPhone) throw new Error("Set KSP_REHEARSAL_TEST_PHONE to an explicitly synthetic Ugandan mobile test number.");
  const normalizedTestPhone = normalizeUgandaPhone(testPhone);
  return { runId, sellerUsernames, testPhone: normalizedTestPhone };
}

function actor(user: { id: string; username: string; displayName: string; role: Role }): AuthContext {
  return {
    sessionId: `rehearsal-seed-${randomBytes(8).toString("hex")}`,
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

async function main() {
  let createdEventId: string | undefined;
  try {
    const { runId, sellerUsernames, testPhone } = assertDevelopmentTarget();
    const users = await prisma.user.findMany({
      where: { username: { in: sellerUsernames }, active: true, role: "SELLER" },
      orderBy: { username: "asc" },
    });
    if (users.length !== 3) throw new Error("All three configured seller accounts must exist, be active and have the SELLER role.");
    const adminUser = await prisma.user.findFirst({ where: { active: true, role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!adminUser) throw new Error("Create an administrator account before running the rehearsal seed.");

    const admin = actor(adminUser);
    const eventName = `[REHEARSAL ONLY] ${runId}`;
    if (await prisma.event.findFirst({ where: { name: eventName } })) {
      throw new Error(`A rehearsal event named ${eventName} already exists. Choose a new KSP_REHEARSAL_RUN_ID; seeded data is retained.`);
    }

    const eventDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const event = await createEvent(admin, createEventSchema.parse({
      name: eventName,
      description: `Development rehearsal ${runId}; synthetic ticket and remittance records only.`,
      venue: "KSP Hotel Gulu (rehearsal)",
      eventDate,
      startTime: "18:00",
      endTime: "23:00",
      timezone: "Africa/Kampala",
      capacity: 116,
      status: "SCHEDULED",
      requireBuyerDetails: true,
      // Disabled for this non-production event so two sellers can race on the dedicated unissued race ticket.
      requireStockIssue: false,
      allowSellerManualSale: false,
      requireFullPaymentAtSale: true,
      buyerNoticeText: "Development rehearsal only. Use synthetic test details.",
    }));
    createdEventId = event.id;

    const ticketType = await createTicketType(admin, event.id, createTicketTypeSchema.parse({
      name: "Rehearsal entry",
      description: "Development-only rehearsal ticket.",
      priceUgx: 12_000,
      allocationLimit: 116,
      permitsAdmission: true,
    }));
    await openSales(admin, event.id);
    const batch = await generateBatch(admin, generateBatchSchema.parse({
      eventId: event.id,
      ticketTypeId: ticketType.id,
      quantity: 116,
      serialPrefix: `R${runId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      label: `REHEARSAL ONLY ${runId}`,
    }), `rehearsal-${runId}-batch`);
    const tickets = await prisma.ticket.findMany({ where: { batchId: batch.batch.id }, orderBy: { serial: "asc" } });
    if (tickets.length !== 116) throw new Error(`Expected 116 generated tickets; found ${tickets.length}.`);

    let cursor = 0;
    for (let sellerIndex = 0; sellerIndex < users.length; sellerIndex++) {
      const seller = users[sellerIndex];
      const plan = DISTRIBUTION[sellerIndex];
      const sellerTickets = tickets.slice(cursor, cursor + plan.issued);
      cursor += plan.issued;
      const sellerActor = actor(seller);

      await issueStock(admin, stockIssueSchema.parse({
        eventId: event.id,
        sellerId: seller.id,
        selection: { kind: "SERIALS", serials: sellerTickets.map((ticket) => ticket.serial) },
      }), `rehearsal-${runId}-issue-${sellerIndex + 1}`);

      const soldTickets = sellerTickets.slice(0, plan.sold);
      const saleInput = saleCreateSchema.parse({
        eventId: event.id,
        tickets: soldTickets.map((ticket) => ({ token: decryptToken(ticket.tokenEnc) })),
        customerName: `Rehearsal Buyer ${sellerIndex + 1}`,
        customerPhone: testPhone,
        notes: "Synthetic development rehearsal sale; not a real guest.",
        initialPayment: { amountUgx: plan.sold * 12_000, method: sellerIndex === 1 ? "MOBILE_MONEY" : "CASH", notes: "Synthetic rehearsal payment record." },
      });
      await createSale(sellerActor, saleInput, `rehearsal-${runId}-sale-${sellerIndex + 1}`);

      const notSold = sellerTickets.slice(plan.sold);
      const returnedTickets = notSold.slice(0, plan.returned);
      const lostTickets = notSold.slice(plan.returned, plan.returned + plan.lost);
      if (returnedTickets.length) {
        await returnStock(admin, stockReturnSchema.parse({
          eventId: event.id,
          sellerId: seller.id,
          serials: returnedTickets.map((ticket) => ticket.serial),
          note: "Synthetic rehearsal return; physical sample stock reconciled.",
        }), `rehearsal-${runId}-return-${sellerIndex + 1}`);
      }
      if (lostTickets.length) {
        await markStockLost(admin, stockLossSchema.parse({
          eventId: event.id,
          sellerId: seller.id,
          serials: lostTickets.map((ticket) => ticket.serial),
          reason: "Synthetic rehearsal loss entry; no real ticket lost.",
        }), `rehearsal-${runId}-loss-${sellerIndex + 1}`);
      }

      await recordRemittance(admin, remittanceCreateSchema.parse({
        eventId: event.id,
        sellerId: seller.id,
        amountUgx: Math.floor(plan.sold * 12_000 * 0.8),
        method: "CASH",
        receivedById: adminUser.id,
        note: "Synthetic rehearsal remittance; no real money exchanged.",
      }), `rehearsal-${runId}-remittance-${sellerIndex + 1}`);
    }

    console.log(`Created rehearsal-only event ${event.name} (${event.id}).`);
    console.log("Generated 116 tickets: 100 issued across three sellers (60 sold, 31 returned, 9 marked lost) plus 16 unissued practice tickets.");
    console.log(`Development seller accounts: ${users.map((user) => user.username).join(", ")}. Synthetic remittances were recorded; no real money was exchanged. Seller close-out is left for the hands-on rehearsal.`);
    console.log("Rehearsal QR tokens were not printed to the console.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Rehearsal seed failed.");
    if (createdEventId) console.error(`Partial rehearsal event retained for review: ${createdEventId}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
