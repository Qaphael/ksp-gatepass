import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./db";
import { unique } from "./client";
import { placeholderTicketTemplateConfig } from "@/lib/validation/ticket-templates";
import { ensureTicketTemplateStorage, writeTicketTemplateArtwork } from "@/lib/ticket-template-storage";

/** Create a measured, active template fixture for production-print integration tests. */
export async function createActiveTicketTemplate(eventId: string, ticketTypeId: string) {
  const config = placeholderTicketTemplateConfig();
  const bytes = await sharp({ create: { width: 2160, height: 650, channels: 3, background: "#d8c49a" } }).png().toBuffer();
  const key = `${randomUUID().replaceAll("-", "")}.png`;
  await writeTicketTemplateArtwork(await ensureTicketTemplateStorage(), key, bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return prisma.ticketTemplate.create({ data: {
    seriesId: unique("print-template"), eventId, ticketTypeId,
    name: "Integration print template", version: 1, assetStorageKey: key,
    assetChecksum: checksum, assetWidthPx: 2160, assetHeightPx: 650,
    trim: config.trim, bleedMm: config.bleedMm, config,
    status: "ACTIVE", zonesArePlaceholder: false,
  } });
}
