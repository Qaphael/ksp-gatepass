import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { paymentCreateSchema } from "@/lib/validation/sales";
import { getSale, recordPayment } from "@/server/services/sales.service";

export const GET = apiHandler(async (ctx, _req, { id }: { id: string }) => {
  const sale = await getSale(ctx, id);
  return jsonOk(sale.payments);
});

export const POST = apiHandler(async (ctx, req, { id }: { id: string }) => {
  const input = paymentCreateSchema.parse(await readJson(req));
  const result = await recordPayment(ctx, id, input, req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
