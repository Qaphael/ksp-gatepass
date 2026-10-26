import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listUsers, type UserDto } from "@/server/services/users.service";
import { TeamManager } from "@/components/team/team-manager";

export const instant = false;

export default async function TeamPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "user:read")) redirect("/dashboard");

  const users: UserDto[] = await listUsers(ctx);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accounts are deactivated, never deleted, so history stays intact.
        </p>
      </div>
      <TeamManager users={users} currentUserId={ctx.userId} canManage={can(ctx.role, "user:manage")} />
    </div>
  );
}
