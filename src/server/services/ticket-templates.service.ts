import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma, TicketTemplate as DbTicketTemplate, TicketTemplateStatus } from "@/generated/prisma/client";
import sharp from "sharp";
import type { AuthContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { ensureTicketTemplateStorage, readTicketTemplateArtwork, removeTicketTemplateArtwork, writeTicketTemplateArtwork } from "@/lib/ticket-template-storage";
import { sanitizeAuditData } from "@/lib/audit";
import type { TicketTemplateConfig } from "@/lib/validation/ticket-templates";
import { ticketTemplateConfigSchema, placeholderTicketTemplateConfig } from "@/lib/validation/ticket-templates";
import { conflict, forbidden, notFound, requirePermission, validationError } from "./errors";

export const TICKET_TEMPLATE_MAX_BYTES = 40 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const SAFE_ARTWORK_KEY = /^[A-Za-z0-9_-]{32}\.(?:png|jpg)$/;
const LIST_SELECT = {
  id: true, seriesId: true, eventId: true, ticketTypeId: true, name: true, version: true,
  assetStorageKey: true, assetChecksum: true, assetWidthPx: true, assetHeightPx: true, trim: true, bleedMm: true,
  config: true, status: true, zonesArePlaceholder: true, confirmedById: true,
  confirmedAt: true, calibrationPrintedAt: true, calibrationPrintedById: true,
  createdAt: true, updatedAt: true,
  _count: { select: { printBatches: true } },
} as const;
type TemplateRow = Pick<DbTicketTemplate,
  "id" | "seriesId" | "eventId" | "ticketTypeId" | "name" | "version" |
  "assetStorageKey" | "assetChecksum" | "assetWidthPx" | "assetHeightPx" | "trim" | "bleedMm" |
  "config" | "status" | "zonesArePlaceholder" | "confirmedById" |
  "confirmedAt" | "calibrationPrintedAt" | "calibrationPrintedById" | "createdAt" | "updatedAt"> & {
  _count?: { printBatches: number };
};
type Tx = Prisma.TransactionClient;

export interface TicketTemplateDto {
  id: string; seriesId: string; eventId: string; ticketTypeId: string | null;
  name: string; version: number; artworkUrl: string; assetWidthPx: number; assetHeightPx: number;
  trim: unknown; bleedMm: number; config: unknown; status: TicketTemplateStatus;
  zonesArePlaceholder: boolean; confirmedById: string | null; confirmedAt: Date | null;
  calibrationPrintedAt: Date | null; calibrationPrintedById: string | null;
  printBatchCount: number;
  createdAt: Date; updatedAt: Date;
}

function requireTemplatePermission(ctx: AuthContext): void {
  if (ctx.role !== "ADMIN") throw forbidden("Only administrators can manage ticket templates.");
  requirePermission(ctx.role, "template:manage");
}
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + stableJson(record[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
function toDto(row: TemplateRow): TicketTemplateDto {
  return {
    id: row.id, seriesId: row.seriesId, eventId: row.eventId, ticketTypeId: row.ticketTypeId,
    name: row.name, version: row.version,
    artworkUrl: "/api/v1/ticket-templates/" + encodeURIComponent(row.id) + "/artwork",
    assetWidthPx: row.assetWidthPx, assetHeightPx: row.assetHeightPx, trim: row.trim,
    bleedMm: row.bleedMm, config: row.config, status: row.status,
    zonesArePlaceholder: row.zonesArePlaceholder, confirmedById: row.confirmedById,
      confirmedAt: row.confirmedAt, calibrationPrintedAt: row.calibrationPrintedAt,
      calibrationPrintedById: row.calibrationPrintedById,
    printBatchCount: row._count?.printBatches ?? 0,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}
function detectFormat(input: Buffer): "png" | "jpeg" {
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return "jpeg";
  throw validationError("Choose a PNG or JPEG image. SVG and other formats are not supported.");
}

export async function processTemplateArtwork(input: Buffer, config: TicketTemplateConfig) {
  if (input.byteLength === 0) throw validationError("Choose an image file to upload.");
  if (input.byteLength > TICKET_TEMPLATE_MAX_BYTES) throw validationError("Artwork must be 40 MB or smaller.");
  const format = detectFormat(input);
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(input, { failOn: "error", sequentialRead: true }).metadata();
  } catch {
    throw validationError("The image could not be decoded. Choose a valid PNG or JPEG file.");
  }
  if (metadata.format !== format) throw validationError("The image content does not match its PNG or JPEG signature.");
  if (metadata.pages && metadata.pages > 1) throw validationError("Animated artwork is not supported.");
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) throw validationError("Artwork must be 40 megapixels or smaller.");

  const expectedWidthMm = config.trim.widthMm + config.bleedMm * 2;
  const expectedHeightMm = config.trim.heightMm + config.bleedMm * 2;
  const expectedWidthPx = Math.round(expectedWidthMm / 25.4 * 300);
  const expectedHeightPx = Math.round(expectedHeightMm / 25.4 * 300);
  const expectedRatio = expectedWidthMm / expectedHeightMm;
  const swapsDimensions = metadata.orientation !== undefined && [5, 6, 7, 8].includes(metadata.orientation);
  const ratio = swapsDimensions ? metadata.height! / metadata.width! : metadata.width! / metadata.height!;
  if (Math.abs(ratio / expectedRatio - 1) > 0.01) {
    throw validationError("Artwork aspect ratio must match trim plus bleed. At 300 dpi, use approximately " + expectedWidthPx + " × " + expectedHeightPx + " px.");
  }
  try {
    const pipeline = sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS, sequentialRead: true })
      .rotate().flatten({ background: "#ffffff" }).toColourspace("srgb");
    const output = format === "png"
      ? await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer({ resolveWithObject: true });
    return { data: output.data, format, width: output.info.width, height: output.info.height, checksum: sha256(output.data) };
  } catch {
    throw validationError("The image could not be processed as RGB artwork. Choose a valid PNG or JPEG file.");
  }
}
function makeStorageKey(format: "png" | "jpeg"): string {
  return randomBytes(24).toString("base64url") + (format === "jpeg" ? ".jpg" : ".png");
}
async function ensureEventAndType(eventId: string, ticketTypeId?: string | null) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, status: true } });
  if (!event) throw notFound("Event not found.");
  if (event.status === "COMPLETED" || event.status === "ARCHIVED") throw conflict("Completed or archived events cannot be changed.");
  if (ticketTypeId) {
    const type = await prisma.ticketType.findUnique({ where: { id: ticketTypeId }, select: { eventId: true } });
    if (!type || type.eventId !== eventId) throw notFound("Ticket category not found for this event.");
  }
}
async function findPrior(ctx: AuthContext, operation: string, key: string, requestHash: string): Promise<TicketTemplateDto | null> {
  const prior = await prisma.ticketTemplateMutation.findUnique({
    where: { actorId_operation_idempotencyKey: { actorId: ctx.userId, operation, idempotencyKey: key } },
    include: { template: { select: LIST_SELECT } },
  });
  if (!prior) return null;
  if (prior.requestHash !== requestHash) throw conflict("This idempotency key was already used for a different template request.");
  return toDto(prior.template);
}
async function findPriorInTransaction(tx: Tx, ctx: AuthContext, operation: string, key: string, requestHash: string): Promise<TemplateRow | null> {
  const prior = await tx.ticketTemplateMutation.findUnique({
    where: { actorId_operation_idempotencyKey: { actorId: ctx.userId, operation, idempotencyKey: key } },
    include: { template: { select: LIST_SELECT } },
  });
  if (!prior) return null;
  if (prior.requestHash !== requestHash) throw conflict("This idempotency key was already used for a different template request.");
  return prior.template;
}
async function resolveRace(ctx: AuthContext, operation: string, key: string, requestHash: string): Promise<TicketTemplateDto> {
  const existing = await findPrior(ctx, operation, key, requestHash);
  if (!existing) throw conflict("This template request conflicted with another update. Retry with a new idempotency key.");
  return existing;
}
async function writeAudit(tx: Tx, ctx: AuthContext, action: string, row: { id: string; eventId: string }, summary: Prisma.InputJsonObject) {
  await tx.auditLog.create({ data: {
    actorId: ctx.userId, actorRole: ctx.role, action, targetType: "ticket-template",
    targetId: row.id, eventId: row.eventId, summary: sanitizeAuditData(summary) as Prisma.InputJsonValue,
  } });
}
function configParts(config: TicketTemplateConfig) {
  return { trim: config.trim, bleedMm: config.bleedMm, config };
}

export async function listTicketTemplates(ctx: AuthContext, eventId: string): Promise<TicketTemplateDto[]> {
  requireTemplatePermission(ctx);
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw notFound("Event not found.");
  const rows = await prisma.ticketTemplate.findMany({ where: { eventId }, orderBy: [{ seriesId: "asc" }, { version: "desc" }], select: LIST_SELECT });
  return rows.map(toDto);
}

export async function createTicketTemplate(
  ctx: AuthContext, eventId: string,
  input: { name: string; ticketTypeId?: string | null; config: TicketTemplateConfig; artwork: Buffer },
  idempotencyKey: string,
): Promise<{ template: TicketTemplateDto; created: boolean }> {
  requireTemplatePermission(ctx);
  await ensureEventAndType(eventId, input.ticketTypeId);
  const config = ticketTemplateConfigSchema.parse(input.config);
  const artwork = await processTemplateArtwork(input.artwork, config);
  const requestHash = sha256(stableJson({ eventId, name: input.name, ticketTypeId: input.ticketTypeId ?? null, config, checksum: artwork.checksum }));
  const prior = await findPrior(ctx, "create", idempotencyKey, requestHash);
  if (prior) return { template: prior, created: false };
  const id = randomUUID();
  const key = makeStorageKey(artwork.format);
  const root = await ensureTicketTemplateStorage();
  await writeTicketTemplateArtwork(root, key, artwork.data);
  try {
    let created = true;
    const row = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>("SELECT id FROM \"Event\" WHERE id = $1 FOR UPDATE", eventId);
      if (!locked[0]) throw notFound("Event not found.");
      const retry = await findPriorInTransaction(tx, ctx, "create", idempotencyKey, requestHash);
      if (retry) { created = false; return retry; }
      const saved = await tx.ticketTemplate.create({ data: {
        id, seriesId: id, eventId, ticketTypeId: input.ticketTypeId ?? null, name: input.name,
        version: 1, assetStorageKey: key, assetChecksum: artwork.checksum,
        assetWidthPx: artwork.width, assetHeightPx: artwork.height, ...configParts(config),
        status: "DRAFT", zonesArePlaceholder: false,
      }, select: LIST_SELECT });
      await tx.ticketTemplateMutation.create({ data: { actorId: ctx.userId, eventId, operation: "create", idempotencyKey, requestHash, templateId: saved.id } });
      await writeAudit(tx, ctx, "ticket-template.artwork.upload", saved, { name: saved.name, version: saved.version, width: artwork.width, height: artwork.height, format: artwork.format });
      return saved;
    });
    if (!created) await removeTicketTemplateArtwork([key]).catch(() => undefined);
    return { template: toDto(row), created };
  } catch (error) {
    await removeTicketTemplateArtwork([key]).catch(() => undefined);
    if (isUniqueViolation(error)) return { template: await resolveRace(ctx, "create", idempotencyKey, requestHash), created: false };
    throw error;
  }
}

export async function patchTicketTemplate(
  ctx: AuthContext, templateId: string,
  input: { name?: string; ticketTypeId?: string | null; config?: TicketTemplateConfig; artwork?: Buffer },
  idempotencyKey: string,
): Promise<{ template: TicketTemplateDto; created: boolean }> {
  requireTemplatePermission(ctx);
  const current = await prisma.ticketTemplate.findUnique({ where: { id: templateId } });
  if (!current) throw notFound("Ticket template not found.");
  const config = ticketTemplateConfigSchema.parse(input.config ?? current.config);
  const ticketTypeId = input.ticketTypeId === undefined ? current.ticketTypeId : input.ticketTypeId;
  await ensureEventAndType(current.eventId, ticketTypeId);
  const artwork = input.artwork ? await processTemplateArtwork(input.artwork, config) : null;
  const name = input.name ?? current.name;
  const checksum = artwork?.checksum ?? current.assetChecksum;
  const requestHash = sha256(stableJson({ templateId, name, ticketTypeId, config, checksum }));
  const prior = await findPrior(ctx, "patch", idempotencyKey, requestHash);
  if (prior) return { template: prior, created: false };
  const latest = await prisma.ticketTemplate.findFirst({ where: { seriesId: current.seriesId }, orderBy: { version: "desc" }, select: { id: true } });
  if (!latest || latest.id !== current.id) throw conflict("Only the latest template version can be edited.");
  const nextKey = artwork ? makeStorageKey(artwork.format) : current.assetStorageKey;
  if (artwork) {
    const root = await ensureTicketTemplateStorage();
    await writeTicketTemplateArtwork(root, nextKey, artwork.data);
  }
  try {
    let created = true;
    const row = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>("SELECT id FROM \"Event\" WHERE id = $1 FOR UPDATE", current.eventId);
      if (!locked[0]) throw notFound("Event not found.");
      const retry = await findPriorInTransaction(tx, ctx, "patch", idempotencyKey, requestHash);
      if (retry) { created = false; return retry; }
      const latestLocked = await tx.ticketTemplate.findFirst({ where: { seriesId: current.seriesId }, orderBy: { version: "desc" }, select: { id: true } });
      if (!latestLocked || latestLocked.id !== current.id) throw conflict("Only the latest template version can be edited.");
      const saved = await tx.ticketTemplate.create({ data: {
        seriesId: current.seriesId, eventId: current.eventId, ticketTypeId, name, version: current.version + 1,
        assetStorageKey: nextKey, assetChecksum: checksum,
        assetWidthPx: artwork?.width ?? current.assetWidthPx, assetHeightPx: artwork?.height ?? current.assetHeightPx,
        ...configParts(config), status: "DRAFT",
        zonesArePlaceholder: current.zonesArePlaceholder && !input.config,
      }, select: LIST_SELECT });
      await tx.ticketTemplateMutation.create({ data: { actorId: ctx.userId, eventId: current.eventId, operation: "patch", idempotencyKey, requestHash, templateId: saved.id } });
      await writeAudit(tx, ctx, "ticket-template.version.create", saved, { name, version: saved.version, priorVersion: current.version });
      if (artwork) await writeAudit(tx, ctx, "ticket-template.artwork.replace", saved, { version: saved.version, width: artwork.width, height: artwork.height, format: artwork.format });
      return saved;
    });
    if (!created && artwork) await removeTicketTemplateArtwork([nextKey]).catch(() => undefined);
    return { template: toDto(row), created };
  } catch (error) {
    if (artwork) await removeTicketTemplateArtwork([nextKey]).catch(() => undefined);
    if (isUniqueViolation(error)) return { template: await resolveRace(ctx, "patch", idempotencyKey, requestHash), created: false };
    throw error;
  }
}

/** Only an inactive, never-printed version can be permanently removed. */
export async function deleteTicketTemplate(ctx: AuthContext, templateId: string): Promise<void> {
  requireTemplatePermission(ctx);
  const initial = await prisma.ticketTemplate.findUnique({ where: { id: templateId }, select: LIST_SELECT });
  // DELETE is intentionally idempotent so a retry after a network timeout is safe.
  if (!initial) return;
  if (initial.status === "ACTIVE") throw conflict("Activate a replacement template before deleting this version.");
  if (initial._count.printBatches > 0) throw conflict("This version has print history and must stay available for reprints and audit.");

  try {
    const unusedArtwork = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM "Event" WHERE id = $1 FOR UPDATE', initial.eventId,
      );
      if (!locked[0]) throw notFound("Event not found.");
      const current = await tx.ticketTemplate.findUnique({ where: { id: templateId }, select: LIST_SELECT });
      if (!current) return null;
      if (current.status === "ACTIVE") throw conflict("Activate a replacement template before deleting this version.");
      if (current._count.printBatches > 0) throw conflict("This version has print history and must stay available for reprints and audit.");

      await writeAudit(tx, ctx, "ticket-template.delete", current, {
        name: current.name,
        version: current.version,
        status: current.status,
      });
      await tx.ticketTemplate.delete({ where: { id: current.id } });
      const remainingAssets = await tx.ticketTemplate.count({ where: { assetStorageKey: current.assetStorageKey } });
      return remainingAssets === 0 ? current.assetStorageKey : null;
    });
    if (unusedArtwork) await removeTicketTemplateArtwork([unusedArtwork]);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") {
      throw conflict("This version is referenced by print history and cannot be deleted.");
    }
    throw error;
  }
}

export async function activateTicketTemplate(
  ctx: AuthContext, templateId: string, input: { ownerConfirmed: true; production: boolean }, idempotencyKey: string,
): Promise<{ template: TicketTemplateDto; created: boolean }> {
  requireTemplatePermission(ctx);
  const current = await prisma.ticketTemplate.findUnique({ where: { id: templateId } });
  if (!current) throw notFound("Ticket template not found.");
  ticketTemplateConfigSchema.parse(current.config);
  const requestHash = sha256(stableJson({ templateId, ownerConfirmed: input.ownerConfirmed, production: input.production }));
  const prior = await findPrior(ctx, "activate", idempotencyKey, requestHash);
  if (prior) return { template: prior, created: false };
  if (input.production && current.zonesArePlaceholder) throw conflict("Measured template zones are required before production activation.");
  if (input.production && (!current.calibrationPrintedAt || !current.calibrationPrintedById)) {
    throw conflict("Print and record a calibration sheet before production activation.");
  }
  if (!input.ownerConfirmed) throw validationError("Owner confirmation is required before activation.");
  try {
    let created = true;
    const row = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>("SELECT id FROM \"Event\" WHERE id = $1 FOR UPDATE", current.eventId);
      if (!locked[0]) throw notFound("Event not found.");
      const retry = await findPriorInTransaction(tx, ctx, "activate", idempotencyKey, requestHash);
      if (retry) { created = false; return retry; }
      const target = await tx.ticketTemplate.findUnique({ where: { id: current.id }, select: LIST_SELECT });
      if (!target) throw notFound("Ticket template not found.");
      if (input.production && target.zonesArePlaceholder) throw conflict("Measured template zones are required before production activation.");
      if (input.production && (!target.calibrationPrintedAt || !target.calibrationPrintedById)) {
        throw conflict("Print and record a calibration sheet before production activation.");
      }
      const active = await tx.ticketTemplate.findMany({
        where: { eventId: current.eventId, ticketTypeId: current.ticketTypeId, status: "ACTIVE", id: { not: current.id } },
        select: LIST_SELECT,
      });
      for (const replaced of active) {
        await tx.ticketTemplate.update({ where: { id: replaced.id }, data: { status: "RETIRED" } });
        await writeAudit(tx, ctx, "ticket-template.retire", replaced, { replacedByTemplateId: target.id, version: replaced.version });
      }
      const saved = await tx.ticketTemplate.update({ where: { id: target.id }, data: {
        status: "ACTIVE", confirmedById: ctx.userId, confirmedAt: new Date(),
      }, select: LIST_SELECT });
      await tx.ticketTemplateMutation.create({ data: { actorId: ctx.userId, eventId: current.eventId, operation: "activate", idempotencyKey, requestHash, templateId: saved.id } });
      await writeAudit(tx, ctx, "ticket-template.activate", saved, { version: saved.version, production: input.production });
      return saved;
    });
    return { template: toDto(row), created };
  } catch (error) {
    if (isUniqueViolation(error)) return { template: await resolveRace(ctx, "activate", idempotencyKey, requestHash), created: false };
    throw error;
  }
}

/**
 * The calibration PDF endpoint records that a file was generated. An admin
 * must separately confirm the paper print before production activation can
 * pass, so merely downloading a PDF never satisfies the calibration gate.
 */
export async function confirmTicketTemplateCalibration(
  ctx: AuthContext,
  templateId: string,
  input: { printBatchId: string; confirmedPrinted: true },
  idempotencyKey: string,
): Promise<{ template: TicketTemplateDto; created: boolean }> {
  requireTemplatePermission(ctx);
  const current = await prisma.ticketTemplate.findUnique({ where: { id: templateId } });
  if (!current) throw notFound("Ticket template not found.");
  const requestHash = sha256(stableJson({ templateId, printBatchId: input.printBatchId, confirmedPrinted: input.confirmedPrinted }));
  const prior = await findPrior(ctx, "calibration-confirm", idempotencyKey, requestHash);
  if (prior) return { template: prior, created: false };

  const assertCalibrationPrint = (print: { eventId: string; templateId: string | null; templateVersion: number | null; outputKind: string | null }) => {
    if (print.eventId !== current.eventId || print.templateId !== current.id ||
      print.templateVersion !== current.version || print.outputKind !== "CALIBRATION") {
      throw conflict("Generate a calibration sheet for this exact template version before confirming its paper print.");
    }
  };
  const generated = await prisma.printBatch.findUnique({
    where: { id: input.printBatchId },
    select: { id: true, eventId: true, templateId: true, templateVersion: true, outputKind: true },
  });
  if (!generated) throw notFound("Calibration PDF record not found.");
  assertCalibrationPrint(generated);

  const operation = "calibration-confirm";
  try {
    let created = true;
    const row = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM "Event" WHERE id = $1 FOR UPDATE', current.eventId,
      );
      if (!locked[0]) throw notFound("Event not found.");
      const retry = await findPriorInTransaction(tx, ctx, operation, idempotencyKey, requestHash);
      if (retry) { created = false; return retry; }
      const target = await tx.ticketTemplate.findUnique({ where: { id: templateId }, select: LIST_SELECT });
      if (!target) throw notFound("Ticket template not found.");
      if (target.version !== current.version) throw conflict("The template changed after this calibration sheet was generated.");
      const sourcePrint = await tx.printBatch.findUnique({
        where: { id: input.printBatchId },
        select: { id: true, eventId: true, templateId: true, templateVersion: true, outputKind: true },
      });
      if (!sourcePrint) throw notFound("Calibration PDF record not found.");
      assertCalibrationPrint(sourcePrint);
      const saved = await tx.ticketTemplate.update({
        where: { id: target.id },
        data: { calibrationPrintedAt: new Date(), calibrationPrintedById: ctx.userId },
        select: LIST_SELECT,
      });
      await tx.ticketTemplateMutation.create({
        data: {
          actorId: ctx.userId, eventId: current.eventId, operation, idempotencyKey,
          requestHash, templateId: saved.id,
        },
      });
      await writeAudit(tx, ctx, "ticket-template.calibration.printed", saved, {
        version: saved.version,
        calibrationPrintBatchId: input.printBatchId,
      });
      return saved;
    });
    return { template: toDto(row), created };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { template: await resolveRace(ctx, operation, idempotencyKey, requestHash), created: false };
    }
    throw error;
  }
}

export async function getTicketTemplateArtwork(ctx: AuthContext, templateId: string): Promise<{ data: Buffer; format: "png" | "jpeg" }> {
  requireTemplatePermission(ctx);
  const row = await prisma.ticketTemplate.findUnique({ where: { id: templateId }, select: { assetStorageKey: true } });
  if (!row || !SAFE_ARTWORK_KEY.test(row.assetStorageKey)) throw notFound("Ticket artwork not found.");
  try {
    return { data: await readTicketTemplateArtwork(row.assetStorageKey), format: row.assetStorageKey.endsWith(".png") ? "png" : "jpeg" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw notFound("Ticket artwork not found.");
    throw error;
  }
}

/** Dev-only seed helper; the command requires an explicit event id. */
export async function seedPlaceholderTicketTemplate(eventId: string, artworkBuffer: Buffer): Promise<TicketTemplateDto> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw notFound("Event not found.");
  const name = "DEVELOPMENT PLACEHOLDER — replace with measured zones";
  const existing = await prisma.ticketTemplate.findFirst({ where: { eventId, name, zonesArePlaceholder: true }, orderBy: { version: "desc" } });
  if (existing) return toDto(existing);
  const config = ticketTemplateConfigSchema.parse(placeholderTicketTemplateConfig());
  const artwork = await processTemplateArtwork(artworkBuffer, config);
  const id = randomUUID();
  const key = makeStorageKey(artwork.format);
  const root = await ensureTicketTemplateStorage();
  await writeTicketTemplateArtwork(root, key, artwork.data);
  try {
    const row = await prisma.ticketTemplate.create({ data: {
      id, seriesId: id, eventId, name, version: 1, assetStorageKey: key, assetChecksum: artwork.checksum,
      assetWidthPx: artwork.width, assetHeightPx: artwork.height, ...configParts(config),
      status: "DRAFT", zonesArePlaceholder: true,
    } });
    return toDto(row);
  } catch (error) {
    await removeTicketTemplateArtwork([key]).catch(() => undefined);
    throw error;
  }
}
