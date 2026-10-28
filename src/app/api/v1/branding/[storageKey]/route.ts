import { NextResponse, type NextRequest } from "next/server";
import { jsonError, publicApiHandler } from "@/lib/api";
import { eventBrandingVariantSchema } from "@/lib/validation/event-branding";
import { getPublicBrandingVariant, validateBrandingStorageKey } from "@/server/services/event-branding.service";

export const GET = publicApiHandler(async (req: NextRequest) => {
  const key = req.nextUrl.pathname.split("/").at(-1) ?? "";
  if (!validateBrandingStorageKey(key)) return jsonError(404, "NOT_FOUND", "Image not found.");
  const parsedVariant = eventBrandingVariantSchema.safeParse(req.nextUrl.searchParams.get("variant") ?? "display");
  if (!parsedVariant.success) return jsonError(422, "VALIDATION_ERROR", "Image variant must be thumbnail or display.");
  const asset = await getPublicBrandingVariant(key, parsedVariant.data);
  if (!asset) return jsonError(404, "NOT_FOUND", "Image not found.");

  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = asset.kind === "POSTER" ? "event-poster.webp" : "event-logo.webp";
  return new NextResponse(new Uint8Array(asset.data), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(asset.data.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
