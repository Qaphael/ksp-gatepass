import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { revokeTicketSchema } from "@/lib/validation/tickets";
import { revokeTicket } from "@/server/services/tickets.service";

export const POST = apiHandler(async (ctx, req, params) => {
  const input = revokeTicketSchema.parse(await readJson(req));
  const ticket = await revokeTicket(ctx, params.id, input);
  return jsonOk({ ticket });
});
