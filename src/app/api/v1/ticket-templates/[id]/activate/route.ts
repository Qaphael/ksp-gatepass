import { NextRequest } from "next/server";
import { apiHandler, jsonOk, readJson, ServiceError, ERROR_CODES } from "@/lib/api";
import { activateTicketTemplateSchema } from "@/lib/validation/ticket-templates";
import { activateTicketTemplate } from "@/server/services/ticket-templates.service";

const IDEMPOTENCY_KEY_RE = /^[\x21-\x7E]{1,128}$/;

export const POST = apiHandler(async (ctx, req: NextRequest, params) => {
  const rawKey = req.headers.get("idempotency-key")?.trim();
  if (!rawKey || !IDEMPOTENCY_KEY_RE.test(rawKey)) {
    throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "A printable Idempotency-Key of 1-128 characters is required.");
  }
  const input = activateTicketTemplateSchema.parse(await readJson(req));
  const result = await activateTicketTemplate(ctx, params.id, input, rawKey);
  return jsonOk(result);
});
