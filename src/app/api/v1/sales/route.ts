import { apiHandler, jsonOk, readJson, requestQuery } from "@/lib/api";
import { saleCreateSchema, saleListQuerySchema } from "@/lib/validation/sales";
import { createSale, listSales } from "@/server/services/sales.service";

export const GET = apiHandler(async (ctx, req) =>
  jsonOk(await listSales(ctx, saleListQuerySchema.parse(requestQuery(req)))),
);

export const POST = apiHandler(async (ctx, req) => {
  const input = saleCreateSchema.parse(await readJson(req));
  const result = await createSale(ctx, input, req.headers.get("idempotency-key"));
  return jsonOk(result, result.created ? 201 : 200);
});
