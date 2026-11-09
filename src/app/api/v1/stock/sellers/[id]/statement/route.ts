import { apiHandler, jsonOk, requestQuery } from "@/lib/api";
import { stockStatementQuerySchema } from "@/lib/validation/stock";
import { getSellerStockStatement } from "@/server/services/stock.service";

export const GET = apiHandler(async (ctx, req, { id }) =>
  jsonOk(await getSellerStockStatement(ctx, id, stockStatementQuerySchema.parse(requestQuery(req)))),
);
