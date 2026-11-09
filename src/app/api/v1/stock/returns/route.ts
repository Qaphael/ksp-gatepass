import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { stockReturnSchema } from "@/lib/validation/stock";
import { returnStock } from "@/server/services/stock.service";

export const POST = apiHandler(async (ctx, req) => {
  const result = await returnStock(ctx, stockReturnSchema.parse(await readJson(req)), req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
