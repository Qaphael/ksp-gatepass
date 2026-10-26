import Link from "next/link";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { NavLinks, type NavItem } from "@/components/layout/nav-links";
import { UserMenu } from "@/components/layout/user-menu";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

// The shell is gated on the session cookie; renders per request.
export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Overview" },
    ...(can(ctx.role, "event:read") ? [{ href: "/events", label: "Events" }] : []),
    ...(can(ctx.role, "inventory:read")
      ? [{ href: "/tickets", label: "Tickets" }]
      : []),
    ...(can(ctx.role, "user:read") ? [{ href: "/team", label: "Team" }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/dashboard"
              className="font-semibold whitespace-nowrap tracking-tight"
            >
              KSP GatePass
            </Link>
            <NavLinks items={navItems} />
          </div>
          <UserMenu
            user={{ displayName: ctx.displayName, role: ctx.role }}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
      <Toaster position="top-center" />
    </div>
  );
}
