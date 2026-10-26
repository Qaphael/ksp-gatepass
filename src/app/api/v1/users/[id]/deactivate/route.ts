import { apiHandler, jsonOk } from "@/lib/api";
import { deactivateUser } from "@/server/services/users.service";

export const POST = apiHandler(async (ctx, _req, params) => {
  const user = await deactivateUser(ctx, params.id);
  return jsonOk({ user });
});
