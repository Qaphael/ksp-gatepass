import { apiHandler, jsonOk } from "@/lib/api";
import { getBatchFlow } from "@/server/services/ticket-batches.service";

export const GET = apiHandler(async (ctx, _req, params) => {
  return jsonOk(await getBatchFlow(ctx, params.id));
});