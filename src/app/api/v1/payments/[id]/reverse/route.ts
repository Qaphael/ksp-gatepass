import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { paymentAdjustmentSchema } from "@/lib/validation/sales";
import { adjustPayment } from "@/server/services/sales.service";

export const POST = apiHandler(async (ctx, req, { id }: { id: string }) => {
  const input = paymentAdjustmentSchema.parse(await readJson(req));
  const result = await adjustPayment(ctx, id, "REVERSAL", input, req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
