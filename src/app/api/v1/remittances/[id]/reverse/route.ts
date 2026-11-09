import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { remittanceReverseSchema } from "@/lib/validation/stock";
import { reverseRemittance } from "@/server/services/stock.service";

export const POST = apiHandler(async (ctx, req, { id }) => {
  const result = await reverseRemittance(ctx, id, remittanceReverseSchema.parse(await readJson(req)), req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
