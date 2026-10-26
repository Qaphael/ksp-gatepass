import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { updateTicketTypeSchema } from "@/lib/validation/ticket-types";
import { updateTicketType } from "@/server/services/ticket-types.service";

export const PATCH = apiHandler(async (ctx, req, params) => {
  const input = updateTicketTypeSchema.parse(await readJson(req));
  const ticketType = await updateTicketType(ctx, params.id, input);
  return jsonOk({ ticketType });
});
