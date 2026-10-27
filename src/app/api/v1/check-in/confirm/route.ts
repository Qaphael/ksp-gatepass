import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { confirmSchema } from "@/lib/validation/check-in";
import { confirmCheckIn } from "@/server/services/check-in.service";

export const POST = apiHandler(async (ctx, req) => {
  const input = confirmSchema.parse(await readJson(req));
  return jsonOk(await confirmCheckIn(ctx, input, req.headers.get("idempotency-key")));
});
