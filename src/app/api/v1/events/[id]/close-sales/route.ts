import { apiHandler, jsonOk } from "@/lib/api";
import { closeSales } from "@/server/services/events.service";

export const POST = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ event: await closeSales(ctx, params.id) });
});
