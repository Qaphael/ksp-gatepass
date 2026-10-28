import { randomBytes } from "node:crypto";
import type { EventBrandingAsset as DbEventBrandingAsset } from "@/generated/prisma/client";
import sharp from "sharp";
import type { AuthContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { ensureBrandingStorage, readBrandingFile, removeBrandingFiles, writeBrandingFile } from "@/lib/event-branding-storage";
import { conflict, forbidden, notFound, validationError } from "./errors";

export type EventBrandingKindValue = "POSTER" | "LOGO";
export type EventBrandingVariant = "thumbnail" | "display";

export interface EventBrandingAssetDto {
  id: string;
  kind: EventBrandingKindValue;
  altText: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  displayUrl: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 20_000;
const MAX_PIXELS = 40_000_000;
const BASE_KEY = /^[A-Za-z0-9_-]{32}$/;

function requireAdmin(ctx: AuthContext) {
  if (ctx.role !== "ADMIN") throw forbidden("Only administrators can manage event branding.");
}

function sniffInputFormat(input: Buffer): "jpeg" | "png" | "webp" {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return "jpeg";
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (input.length >= 12 && input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP") return "webp";
  throw validationError("Choose a JPEG, PNG or WebP image. SVG and other formats are not supported.");
}

export async function processBrandingImage(input: Buffer) {
  if (input.byteLength > MAX_BYTES) throw validationError("Image must be 5 MB or smaller.");
  const signatureFormat = sniffInputFormat(input);
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS, sequentialRead: true }).metadata();
  } catch {
    throw validationError("The image could not be decoded. Choose a valid JPEG, PNG or WebP file.");
  }
  if (metadata.format !== signatureFormat) throw validationError("The image content does not match a supported image format.");
  if (metadata.pages && metadata.pages > 1) throw validationError("Animated images are not supported.");
  if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION || metadata.width * metadata.height > MAX_PIXELS) {
    throw validationError("Image dimensions are too large. Use an image under 20,000 pixels on each side and 40 megapixels total.");
  }

  try {
    const thumbnail = await sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS, sequentialRead: true })
      .rotate()
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const display = await sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS, sequentialRead: true })
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 86, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      thumbnail: thumbnail.data,
      display: display.data,
      width: display.info.width,
      height: display.info.height,
    };
  } catch {
    throw validationError("The image could not be processed. Choose a valid JPEG, PNG or WebP file.");
  }
}

function toDto(asset: DbEventBrandingAsset): EventBrandingAssetDto {
  const base = `/api/v1/branding/${encodeURIComponent(asset.storageKey)}`;
  return {
    id: asset.id,
    kind: asset.kind,
    altText: asset.altText,
    width: asset.width,
    height: asset.height,
    thumbnailUrl: `${base}?variant=thumbnail`,
    displayUrl: `${base}?variant=display`,
  };
}

export async function listEventBranding(eventId: string): Promise<{ poster: EventBrandingAssetDto | null; logo: EventBrandingAssetDto | null }> {
  const assets = await prisma.eventBrandingAsset.findMany({ where: { eventId } });
  const poster = assets.find((asset) => asset.kind === "POSTER") ?? null;
  const logo = assets.find((asset) => asset.kind === "LOGO") ?? null;
  return { poster: poster ? toDto(poster) : null, logo: logo ? toDto(logo) : null };
}

export async function uploadEventBranding(
  ctx: AuthContext,
  input: { eventId: string; kind: EventBrandingKindValue; altText: string; file: Buffer },
): Promise<EventBrandingAssetDto> {
  requireAdmin(ctx);
  const event = await prisma.event.findUnique({ where: { id: input.eventId }, select: { id: true, status: true } });
  if (!event) throw notFound("Event not found.");
  if (["COMPLETED", "ARCHIVED"].includes(event.status)) throw conflict("Completed or archived events cannot be changed.");

  const processed = await processBrandingImage(input.file);
  const storageKey = randomBytes(24).toString("base64url");
  const thumbnailKey = `${storageKey}-thumbnail.webp`;
  const displayKey = `${storageKey}-display.webp`;
  const root = await ensureBrandingStorage();
  const written: string[] = [];
  try {
    await writeBrandingFile(root, thumbnailKey, processed.thumbnail); written.push(thumbnailKey);
    await writeBrandingFile(root, displayKey, processed.display); written.push(displayKey);

    const asset = await prisma.$transaction(async (tx) => {
      const lockedEvent = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Event" WHERE id = ${input.eventId} FOR UPDATE`;
      if (!lockedEvent[0]) throw notFound("Event not found.");
      const existing = await tx.eventBrandingAsset.findUnique({ where: { eventId_kind: { eventId: input.eventId, kind: input.kind } } });
      const saved = await tx.eventBrandingAsset.upsert({
        where: { eventId_kind: { eventId: input.eventId, kind: input.kind } },
        create: {
          eventId: input.eventId,
          kind: input.kind,
          storageKey,
          thumbnailKey,
          displayKey,
          altText: input.altText,
          width: processed.width,
          height: processed.height,
        },
        update: {
          storageKey,
          thumbnailKey,
          displayKey,
          altText: input.altText,
          width: processed.width,
          height: processed.height,
        },
      });
      await tx.auditLog.create({ data: {
        actorId: ctx.userId,
        actorRole: ctx.role,
        action: existing ? "event.branding.replace" : "event.branding.upload",
        targetType: "event-branding-asset",
        targetId: saved.id,
        eventId: input.eventId,
        summary: { kind: input.kind, width: processed.width, height: processed.height },
      } });
      return { saved, previous: existing };
    });

    if (asset.previous) {
      try { await removeBrandingFiles([asset.previous.thumbnailKey, asset.previous.displayKey]); }
      catch (error) { console.error("[branding] old asset cleanup failed:", error instanceof Error ? error.message : "unknown error"); }
    }
    return toDto(asset.saved);
  } catch (error) {
    await removeBrandingFiles(written).catch(() => undefined);
    throw error;
  }
}

export async function removeEventBranding(ctx: AuthContext, eventId: string, kind: EventBrandingKindValue): Promise<void> {
  requireAdmin(ctx);
  const removed = await prisma.$transaction(async (tx) => {
    const asset = await tx.eventBrandingAsset.findUnique({ where: { eventId_kind: { eventId, kind } } });
    if (!asset) throw notFound("Branding image not found.");
    await tx.eventBrandingAsset.delete({ where: { id: asset.id } });
    await tx.auditLog.create({ data: {
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "event.branding.remove",
      targetType: "event-branding-asset",
      targetId: asset.id,
      eventId,
      summary: { kind },
    } });
    return asset;
  });
  try { await removeBrandingFiles([removed.thumbnailKey, removed.displayKey]); }
  catch (error) { console.error("[branding] removed asset cleanup failed:", error instanceof Error ? error.message : "unknown error"); }
}

export async function getPublicBrandingVariant(storageKey: string, variant: EventBrandingVariant): Promise<{ data: Buffer; kind: EventBrandingKindValue } | null> {
  if (!BASE_KEY.test(storageKey)) return null;
  const asset = await prisma.eventBrandingAsset.findUnique({ where: { storageKey }, select: { kind: true, thumbnailKey: true, displayKey: true } });
  if (!asset) return null;
  const key = variant === "thumbnail" ? asset.thumbnailKey : asset.displayKey;
  try { return { data: await readBrandingFile(key), kind: asset.kind }; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function validateBrandingStorageKey(value: string): boolean {
  return BASE_KEY.test(value);
}

export { MAX_BYTES as EVENT_BRANDING_MAX_BYTES };
