import { apiHandler, jsonOk } from "@/lib/api";
import { getTicket } from "@/server/services/tickets.service";

export const GET = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ ticket: await getTicket(ctx, params.id) });
});
