import type { NextRequest } from "next/server";
import { apiHandler, jsonOk, ServiceError, ERROR_CODES } from "@/lib/api";
import { createTicketTemplateSchema } from "@/lib/validation/ticket-templates";
import { createTicketTemplate, listTicketTemplates, TICKET_TEMPLATE_MAX_BYTES } from "@/server/services/ticket-templates.service";

const IDEMPOTENCY_KEY_RE = /^[\x21-\x7E]{1,128}$/;

function idempotencyKey(req: NextRequest): string {
  const value = req.headers.get("idempotency-key")?.trim();
  if (!value || !IDEMPOTENCY_KEY_RE.test(value)) {
    throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "A printable Idempotency-Key of 1-128 characters is required.");
  }
  return value;
}

function parseConfig(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Provide the template config as JSON.");
  try { return JSON.parse(value); }
  catch { throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Template config must be valid JSON."); }
}

export const GET = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ templates: await listTicketTemplates(ctx, params.id) });
});

export const POST = apiHandler(async (ctx, req: NextRequest, params) => {
  let form: FormData;
  try { form = await req.formData(); }
  catch { throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Send template data and artwork as a multipart form upload."); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Choose a PNG or JPEG artwork file.");
  if (file.size > TICKET_TEMPLATE_MAX_BYTES) throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Artwork must be 40 MB or smaller.");
  const input = createTicketTemplateSchema.parse({
    name: form.get("name"),
    ticketTypeId: form.has("ticketTypeId") ? form.get("ticketTypeId") : undefined,
    config: parseConfig(form.get("config")),
  });
  const result = await createTicketTemplate(ctx, params.id, {
    ...input,
    artwork: Buffer.from(await file.arrayBuffer()),
  }, idempotencyKey(req));
  return jsonOk(result, result.created ? 201 : 200);
});
