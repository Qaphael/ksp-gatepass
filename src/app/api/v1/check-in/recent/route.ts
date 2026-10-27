import { apiHandler, jsonOk, requestQuery } from "@/lib/api";
import { checkInListQuerySchema } from "@/lib/validation/check-in";
import { listRecentCheckIns } from "@/server/services/check-in.service";

export const GET = apiHandler(async (ctx, req) =>
  jsonOk(await listRecentCheckIns(ctx, checkInListQuerySchema.parse(requestQuery(req)))),
);
