import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { stockLossSchema } from "@/lib/validation/stock";
import { markStockLost } from "@/server/services/stock.service";

export const POST = apiHandler(async (ctx, req) => {
  const result = await markStockLost(ctx, stockLossSchema.parse(await readJson(req)), req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
