import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/role";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { SignOutButton } from "@/components/account/sign-out-button";
import { InstallAppCard } from "@/components/pwa/install-app-card";
import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export const instant = false;

export default async function AccountPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const expiresAt = ctx.expiresAt.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala",
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title="Account" description="Your profile, session and password." />

      <Card>
        <CardHeader className="justify-items-center gap-3 text-center">
          <div className="grid size-20 place-items-center rounded-[1.4rem] border-4 border-white bg-accent text-primary shadow-md ring-1 ring-border">
            <UserRound aria-hidden="true" className="size-9" />
          </div>
          <div className="grid gap-1">
            <CardTitle className="text-xl">{ctx.displayName}</CardTitle>
            <p className="text-base text-muted-foreground">{ROLE_LABELS[ctx.role]}</p>
          </div>
          <p className="sr-only">Profile details</p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 rounded-2xl bg-muted/50 p-4 text-base sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="font-medium">{ctx.displayName}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Username</dt>
              <dd className="font-medium">@{ctx.username}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Role</dt>
              <dd className="font-medium">{ROLE_LABELS[ctx.role]}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Session expires</dt>
              <dd className="font-medium">
                {expiresAt} (EAT)
                <p className="mt-1 text-sm font-normal text-muted-foreground">
                  Signing out or a password change ends sessions immediately.
                </p>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Changing your password signs out every other device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>
            End this session on this device and return to the sign-in screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>

      <InstallAppCard />
    </div>
  );
}
