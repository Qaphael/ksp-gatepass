import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { z } from "zod";
import { refundSale } from "@/server/services/sales.service";

const schema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export const POST = apiHandler(async (ctx, req, { id }: { id: string }) => {
  const { reason } = schema.parse(await readJson(req));
  const result = await refundSale(ctx, id, reason, req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
