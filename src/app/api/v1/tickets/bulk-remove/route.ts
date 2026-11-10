import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { bulkRemoveTicketsSchema } from "@/lib/validation/tickets";
import { bulkRemoveTickets } from "@/server/services/tickets.service";

export const POST = apiHandler(async (ctx, req) => {
  const input = bulkRemoveTicketsSchema.parse(await readJson(req));
  return jsonOk({ tickets: await bulkRemoveTickets(ctx, input) });
});
