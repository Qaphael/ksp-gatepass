import { apiHandler, jsonOk } from "@/lib/api";
import { completeEvent } from "@/server/services/events.service";

export const POST = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ event: await completeEvent(ctx, params.id) });
});
