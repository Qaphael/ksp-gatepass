import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { changePasswordSchema } from "@/lib/validation/auth";
import { changePassword } from "@/server/services/auth.service";

export const POST = apiHandler(async (ctx, req) => {
  const input = changePasswordSchema.parse(await readJson(req));
  await changePassword(ctx, input);
  return jsonOk({ ok: true });
});
