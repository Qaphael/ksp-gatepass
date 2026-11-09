import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { stockCloseoutSchema } from "@/lib/validation/stock";
import { closeOutSeller } from "@/server/services/stock.service";

export const POST = apiHandler(async (ctx, req, { id }) => {
  const result = await closeOutSeller(ctx, id, stockCloseoutSchema.parse(await readJson(req)), req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
