import { apiHandler, jsonOk } from "@/lib/api";
import { openAdmission } from "@/server/services/events.service";

export const POST = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ event: await openAdmission(ctx, params.id) });
});
