import { apiHandler, jsonOk, requestQuery } from "@/lib/api";
import { z } from "zod";
import { getAttendanceSummary } from "@/server/services/check-in.service";

const querySchema = z.object({ eventId: z.string().trim().min(1).max(100) });

export const GET = apiHandler(async (ctx, req) =>
  jsonOk(await getAttendanceSummary(ctx, querySchema.parse(requestQuery(req)).eventId)),
);
