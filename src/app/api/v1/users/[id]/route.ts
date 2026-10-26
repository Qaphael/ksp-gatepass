import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { updateUserSchema } from "@/lib/validation/users";
import { updateUser } from "@/server/services/users.service";

export const PATCH = apiHandler(async (ctx, req, params) => {
  const input = updateUserSchema.parse(await readJson(req));
  const user = await updateUser(ctx, params.id, input);
  return jsonOk({ user });
});
