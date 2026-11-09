import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { remittanceCreateSchema } from "@/lib/validation/stock";
import { recordRemittance } from "@/server/services/stock.service";

export const POST = apiHandler(async (ctx, req) => {
  const result = await recordRemittance(ctx, remittanceCreateSchema.parse(await readJson(req)), req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
