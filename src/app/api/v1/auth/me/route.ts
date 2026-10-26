import { apiHandler, jsonOk } from "@/lib/api";
import { permissionsForRole } from "@/lib/permissions";

export const GET = apiHandler(async (ctx) => {
  return jsonOk({
    user: {
      id: ctx.userId,
      username: ctx.username,
      displayName: ctx.displayName,
      role: ctx.role,
    },
    permissions: permissionsForRole(ctx.role),
    session: { expiresAt: ctx.expiresAt.toISOString() },
  });
});
