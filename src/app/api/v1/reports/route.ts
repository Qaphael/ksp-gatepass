import { apiHandler, jsonOk, requestQuery } from "@/lib/api";
import { reportQuerySchema } from "@/lib/validation/reports";
import { getReport } from "@/server/services/reports.service";

export const GET = apiHandler(async (ctx, req) => jsonOk(await getReport(ctx, reportQuerySchema.parse(requestQuery(req)))));
