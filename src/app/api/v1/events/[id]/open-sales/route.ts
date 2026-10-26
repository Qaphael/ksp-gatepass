import { apiHandler, jsonOk } from "@/lib/api";
import { openSales } from "@/server/services/events.service";

export const POST = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ event: await openSales(ctx, params.id) });
});
