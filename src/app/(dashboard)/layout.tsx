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
    ...(can(ctx.role, "sale:read-own") || can(ctx.role, "sale:read-all")
      ? [{ href: "/sales", label: "Sales" }]
      : []),
    ...(can(ctx.role, "checkin:verify")
      ? [
          { href: "/scanner", label: "Scan QR" },
          { href: "/check-in/manual", label: "Manual check-in" },
        ]
      : []),
    ...(can(ctx.role, "checkin:read-recent")
      ? [{ href: "/check-in/recent", label: "Attendance" }]
      : []),
    ...(can(ctx.role, "checkin:read-attempts")
      ? [{ href: "/check-in/attempts", label: "Scan attempts" }]
      : []),
    ...(can(ctx.role, "report:view-summary") || can(ctx.role, "report:export-own") || can(ctx.role, "report:export-full")
      ? [{ href: "/reports", label: "Reports" }]
      : []),
    ...(can(ctx.role, "audit:read")
      ? [{ href: "/audit-logs", label: "Audit log" }]
      : []),
    ...(can(ctx.role, "user:read") ? [{ href: "/team", label: "Team" }] : []),
  ];

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-background px-4 py-5 md:flex">
        <Link
          href="/dashboard"
          className="mb-8 px-2 font-semibold tracking-tight"
        >
          KSP GatePass
        </Link>
        <NavLinks items={navItems} orientation="vertical" />
        <div className="mt-auto border-t border-border pt-4">
          <UserMenu user={{ displayName: ctx.displayName, role: ctx.role }} />
        </div>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur md:hidden">
          <div className="flex flex-col gap-2 px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/dashboard"
                className="font-semibold whitespace-nowrap tracking-tight"
              >
                KSP GatePass
              </Link>
              <UserMenu user={{ displayName: ctx.displayName, role: ctx.role }} />
            </div>
            <NavLinks items={navItems} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
      </div>
      <Toaster position="top-center" />
    </div>
  );
}
