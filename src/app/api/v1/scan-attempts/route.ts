import { apiHandler, jsonOk, requestQuery } from "@/lib/api";
import { scanAttemptQuerySchema } from "@/lib/validation/check-in";
import { listScanAttempts } from "@/server/services/check-in.service";

export const GET = apiHandler(async (ctx, req) =>
  jsonOk(await listScanAttempts(ctx, scanAttemptQuerySchema.parse(requestQuery(req)))),
);
