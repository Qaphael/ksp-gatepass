import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listUsers, type UserDto } from "@/server/services/users.service";
import { TeamManager } from "@/components/team/team-manager";
import { PageHeader } from "@/components/ui/page-header";

export const instant = false;

export default async function TeamPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "user:read")) redirect("/dashboard");

  const users: UserDto[] = await listUsers(ctx);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Team" description="Accounts are deactivated, never deleted, so history stays intact." />
      <TeamManager users={users} currentUserId={ctx.userId} canManage={can(ctx.role, "user:manage")} />
    </div>
  );
}
