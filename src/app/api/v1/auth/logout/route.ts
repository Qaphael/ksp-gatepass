import { apiHandler, jsonOk } from "@/lib/api";
import { logout } from "@/server/services/auth.service";
import { revokeCurrentSession } from "@/lib/auth/session";

export const POST = apiHandler(async (ctx) => {
  await logout(ctx);
  await revokeCurrentSession();
  return jsonOk({ ok: true });
});
