import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { createUserSchema } from "@/lib/validation/users";
import { createUser, listUsers } from "@/server/services/users.service";

export const GET = apiHandler(async (ctx) => {
  return jsonOk({ users: await listUsers(ctx) });
});

export const POST = apiHandler(async (ctx, req) => {
  const input = createUserSchema.parse(await readJson(req));
  const user = await createUser(ctx, input);
  return jsonOk({ user }, 201);
});
