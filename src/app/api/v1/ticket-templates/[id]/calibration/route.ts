import { confirmTicketTemplateCalibrationSchema } from "@/lib/validation/ticket-templates";
import { apiHandler, jsonOk, readJson, ServiceError, ERROR_CODES } from "@/lib/api";
import { confirmTicketTemplateCalibration } from "@/server/services/ticket-templates.service";

function idempotencyKey(req: Request): string {
  const key = req.headers.get("idempotency-key")?.trim() ?? "";
  if (key.length < 1 || key.length > 128 || /[^\x21-\x7e]/.test(key)) {
    throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "A printable Idempotency-Key of 1-128 characters is required.");
  }
  return key;
}

export const POST = apiHandler(async (ctx, req, params) => {
  const input = confirmTicketTemplateCalibrationSchema.parse(await readJson(req));
  const result = await confirmTicketTemplateCalibration(ctx, params.id, input, idempotencyKey(req));
  return jsonOk(result, result.created ? 201 : 200);
});
