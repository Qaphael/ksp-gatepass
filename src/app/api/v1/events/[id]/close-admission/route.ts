import { apiHandler, jsonOk } from "@/lib/api";
import { closeAdmission } from "@/server/services/events.service";

export const POST = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ event: await closeAdmission(ctx, params.id) });
});
