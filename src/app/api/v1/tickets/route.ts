import { apiHandler, jsonOk, requestQuery } from "@/lib/api";
import { ticketListQuerySchema } from "@/lib/validation/tickets";
import { listTickets } from "@/server/services/tickets.service";

export const GET = apiHandler(async (ctx, req) => {
  const query = ticketListQuerySchema.parse(requestQuery(req));
  return jsonOk(await listTickets(ctx, query));
});
