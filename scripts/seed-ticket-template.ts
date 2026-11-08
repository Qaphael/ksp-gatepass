import "dotenv/config";
import sharp from "sharp";
import { prisma } from "../src/lib/db/client";
import { seedPlaceholderTicketTemplate } from "../src/server/services/ticket-templates.service";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Ticket template seed data is disabled in production.");
  }
  const eventId = process.env.TICKET_TEMPLATE_SEED_EVENT_ID?.trim();
  if (!eventId) throw new Error("Set TICKET_TEMPLATE_SEED_EVENT_ID to an existing development event id.");

  const artwork = await sharp({
    create: { width: 2551, height: 768, channels: 3, background: "#d8c49a" },
  }).png().toBuffer();
  const template = await seedPlaceholderTicketTemplate(eventId, artwork);
  console.log("Seeded development template " + template.id + " version " + template.version + " (PLACEHOLDER zones).");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Ticket template seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
