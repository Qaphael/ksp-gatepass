import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { saleLookupTicketSchema } from "@/lib/validation/sales";
import { lookupTicketForSale } from "@/server/services/sales.service";

export const POST = apiHandler(async (ctx, req) =>
  jsonOk(await lookupTicketForSale(ctx, saleLookupTicketSchema.parse(await readJson(req)))),
);
