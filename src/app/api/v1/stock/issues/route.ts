import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { stockIssueSchema } from "@/lib/validation/stock";
import { issueStock } from "@/server/services/stock.service";

export const POST = apiHandler(async (ctx, req) => {
  const result = await issueStock(ctx, stockIssueSchema.parse(await readJson(req)), req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
