import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { createTicketTypeSchema } from "@/lib/validation/ticket-types";
import {
  createTicketType,
  listTicketTypes,
} from "@/server/services/ticket-types.service";

export const GET = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ ticketTypes: await listTicketTypes(ctx, params.id) });
});

export const POST = apiHandler(async (ctx, req, params) => {
  const input = createTicketTypeSchema.parse(await readJson(req));
  const ticketType = await createTicketType(ctx, params.id, input);
  return jsonOk({ ticketType }, 201);
});
