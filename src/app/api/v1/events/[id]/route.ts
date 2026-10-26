import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { updateEventSchema } from "@/lib/validation/events";
import { getEvent, updateEvent } from "@/server/services/events.service";

export const GET = apiHandler(async (ctx, _req, params) => {
  return jsonOk({ event: await getEvent(ctx, params.id) });
});

export const PATCH = apiHandler(async (ctx, req, params) => {
  const input = updateEventSchema.parse(await readJson(req));
  const event = await updateEvent(ctx, params.id, input);
  return jsonOk({ event });
});
