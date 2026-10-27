import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { checkInCorrectionSchema } from "@/lib/validation/check-in";
import { recordCheckInCorrection } from "@/server/services/check-in.service";

export const POST = apiHandler(async (ctx, req, { id }: { id: string }) => {
  const input = checkInCorrectionSchema.parse(await readJson(req));
  return jsonOk(await recordCheckInCorrection(ctx, id, input), 201);
});
