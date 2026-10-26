import { apiHandler, jsonOk } from "@/lib/api";
import { getBatch } from "@/server/services/ticket-batches.service";

export const GET = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ batch: await getBatch(ctx, params.id) });
});
