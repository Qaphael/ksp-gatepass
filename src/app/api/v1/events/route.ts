import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { createEventSchema } from "@/lib/validation/events";
import { createEvent, listEvents } from "@/server/services/events.service";

export const GET = apiHandler(async (ctx) => {
  return jsonOk({ events: await listEvents(ctx) });
});

export const POST = apiHandler(async (ctx, req) => {
  const input = createEventSchema.parse(await readJson(req));
  const event = await createEvent(ctx, input);
  return jsonOk({ event }, 201);
});
