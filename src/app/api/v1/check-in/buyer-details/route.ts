import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { buyerDetailsLookupSchema } from "@/lib/validation/check-in";
import { lookupBuyerDetailsAtGate } from "@/server/services/check-in.service";

export const POST = apiHandler(async (ctx, req) => {
  const input = buyerDetailsLookupSchema.parse(await readJson(req));
  return jsonOk(await lookupBuyerDetailsAtGate(ctx, input.eventId, input.serial));
});
