import { apiHandler, jsonOk } from "@/lib/api";
import { getTicketTrace } from "@/server/services/tickets.service";

export const GET = apiHandler(async (ctx, _req, params) => {
  return jsonOk(await getTicketTrace(ctx, params.id));
});