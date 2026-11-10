import { NextRequest } from "next/server";
import { apiHandler, jsonOk, readJson, ServiceError, ERROR_CODES } from "@/lib/api";
import { patchTicketTemplateSchema } from "@/lib/validation/ticket-templates";
import { deleteTicketTemplate, patchTicketTemplate, TICKET_TEMPLATE_MAX_BYTES } from "@/server/services/ticket-templates.service";

const IDEMPOTENCY_KEY_RE = /^[\x21-\x7E]{1,128}$/;

function idempotencyKey(req: NextRequest): string {
  const value = req.headers.get("idempotency-key")?.trim();
  if (!value || !IDEMPOTENCY_KEY_RE.test(value)) {
    throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "A printable Idempotency-Key of 1-128 characters is required.");
  }
  return value;
}

function parseMultipartJson(value: FormDataEntryValue): unknown {
  if (typeof value !== "string") throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Template config must be valid JSON.");
  try { return JSON.parse(value); }
  catch { throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Template config must be valid JSON."); }
}

export const PATCH = apiHandler(async (ctx, req: NextRequest, params) => {
  let body: unknown;
  let artwork: Buffer | undefined;
  if (req.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    let form: FormData;
    try { form = await req.formData(); }
    catch { throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Send valid multipart template data."); }
    const file = form.get("file");
    if (file !== null && !(file instanceof File)) throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Choose a PNG or JPEG artwork file.");
    if (file instanceof File) {
      if (file.size > TICKET_TEMPLATE_MAX_BYTES) throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Artwork must be 40 MB or smaller.");
      artwork = Buffer.from(await file.arrayBuffer());
    }
    const configEntry = form.get("config");
    body = {
      ...(form.has("name") ? { name: form.get("name") } : {}),
      ...(form.has("ticketTypeId") ? { ticketTypeId: form.get("ticketTypeId") === "null" ? null : form.get("ticketTypeId") } : {}),
      ...(configEntry !== null ? { config: parseMultipartJson(configEntry) } : {}),
    };
  } else {
    body = await readJson(req);
  }
  const input = patchTicketTemplateSchema.parse(body);
  const result = await patchTicketTemplate(ctx, params.id, { ...input, artwork }, idempotencyKey(req));
  return jsonOk(result, result.created ? 201 : 200);
});

export const DELETE = apiHandler(async (ctx, _req, params) => {
  await deleteTicketTemplate(ctx, params.id);
  return jsonOk({ deleted: true });
});
