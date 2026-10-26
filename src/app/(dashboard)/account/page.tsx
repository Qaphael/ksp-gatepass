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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your profile, session and password.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="font-medium">{ctx.displayName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Username</dt>
              <dd className="font-medium">@{ctx.username}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Role</dt>
              <dd className="font-medium">{ROLE_LABELS[ctx.role]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Session expires</dt>
              <dd className="font-medium">
                {expiresAt} (EAT)
                <p className="mt-0.5 text-xs font-normal text-muted-foreground">
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
    </div>
  );
}
