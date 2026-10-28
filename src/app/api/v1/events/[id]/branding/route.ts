import { NextResponse, type NextRequest } from "next/server";
import { apiHandler, jsonOk } from "@/lib/api";
import { eventBrandingKindSchema, eventBrandingRemoveQuerySchema, eventBrandingUploadMetadataSchema } from "@/lib/validation/event-branding";
import { EVENT_BRANDING_MAX_BYTES, removeEventBranding, uploadEventBranding } from "@/server/services/event-branding.service";

export const PUT = apiHandler(async (ctx, req: NextRequest, params) => {
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Send the image as a multipart form upload." } }, { status: 422 }); }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Choose an image file to upload." } }, { status: 422 });
  }
  if (file.size > EVENT_BRANDING_MAX_BYTES) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Image must be 5 MB or smaller." } }, { status: 422 });
  }
  const metadata = eventBrandingUploadMetadataSchema.parse({ kind: form.get("kind"), altText: form.get("altText") });
  const asset = await uploadEventBranding(ctx, {
    eventId: params.id,
    kind: metadata.kind,
    altText: metadata.altText,
    file: Buffer.from(await file.arrayBuffer()),
  });
  return jsonOk({ asset }, 201);
});

export const DELETE = apiHandler(async (ctx, req, params) => {
  const query = eventBrandingRemoveQuerySchema.parse({ kind: new URL(req.url).searchParams.get("kind") });
  await removeEventBranding(ctx, params.id, eventBrandingKindSchema.parse(query.kind));
  return new NextResponse(null, { status: 204 });
});
