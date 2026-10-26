import { apiHandler, jsonOk } from "@/lib/api";
import { archiveEvent } from "@/server/services/events.service";

export const POST = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ event: await archiveEvent(ctx, params.id) });
});
