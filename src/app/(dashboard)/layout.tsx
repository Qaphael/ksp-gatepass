import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/brand/logo-mark";
import { NavLinks, type NavIconName, type NavItem } from "@/components/layout/nav-links";
import { AppHeader, BottomNav } from "@/components/layout/app-header";
import { UserMenu } from "@/components/layout/user-menu";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { Toaster } from "@/components/ui/sonner";

export const instant = false;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const permitted = (href: string, label: NavIconName, permission: Parameters<typeof can>[1]): NavItem | null =>
    can(ctx.role, permission) ? { href, label, icon: label } : null;
  const all = {
    overview: permitted("/dashboard", "Overview", "event:read"),
    sales: permitted("/sales", "Sales", "sale:read-own"),
    tickets: can(ctx.role, "inventory:read") || can(ctx.role, "sale:read-own") ? { href: "/tickets", label: "Tickets", icon: "Tickets" as const } : null,
    scan: permitted("/scanner", "Check-in", "checkin:verify"),
    manual: permitted("/check-in/manual", "Manual", "checkin:verify"),
    recent: permitted("/check-in/recent", "Recent", "checkin:read-recent"),
    attempts: permitted("/check-in/attempts", "Attempts", "checkin:read-attempts"),
    reports: (can(ctx.role, "report:view-summary") || can(ctx.role, "report:export-own") || can(ctx.role, "report:export-full")) ? { href: "/reports", label: "Reports", icon: "Reports" as const } : null,
    events: permitted("/events", "Events", "event:read"),
    team: permitted("/team", "Team", "user:read"),
    audit: permitted("/audit-logs", "Audit log", "audit:read"),
    settings: { href: "/account", label: "Settings", icon: "Settings" as const },
    stock: (can(ctx.role, "stock:read-own") || can(ctx.role, "stock:read-all")) ? { href: "/stock", label: "Stock", icon: "Stock" as const } : null,
  };
  const collect = (...items: Array<NavItem | null>) => items.filter((item): item is NavItem => Boolean(item));
  let navItems: NavItem[];
  if (ctx.role === "VERIFIER") navItems = collect(all.overview, all.scan, all.manual, all.recent);
  else if (ctx.role === "SELLER") navItems = collect({ href: "/sales/new", label: "Sell", icon: "Sell" }, all.sales, all.tickets, all.stock);
  else if (ctx.role === "SUPERVISOR") navItems = collect(all.overview, all.scan, all.attempts, all.reports);
  else navItems = collect(all.overview, all.sales, all.tickets, all.scan, all.stock, all.events, all.team, all.audit, all.reports, all.settings);
  const landing = ctx.role === "VERIFIER" ? "/scanner" : ctx.role === "SELLER" ? "/sales/new" : "/dashboard";

  const sectionLabels: Record<string, string> = {
    "/dashboard": "Overview",
    "/sales": "Sales",
    "/scanner": "Scanner",
    "/check-in/manual": "Manual Entry",
    "/check-in/recent": "Attendance",
    "/check-in/attempts": "Scan Attempts",
    "/tickets": "Ticket Inventory",
    "/tickets/new": "Generate Tickets",
    "/events": "Events",
    "/team": "Team",
    "/reports": "Reports",
    "/audit-logs": "Audit Log",
    "/account": "Account",
    "/stock": "Stock",
  };

  const currentSection = sectionLabels[ctx.role === "VERIFIER" ? "/scanner" : ctx.role === "SELLER" ? "/sales/new" : "/dashboard"];

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row bg-background" style={{ minHeight: "100dvh" }}>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 text-sidebar-foreground lg:flex">
        <Link href={landing} aria-label="KSP GatePass home" className="mb-8 block px-2"><BrandLockup /></Link>
        <div className="mt-6"><NavLinks items={navItems} orientation="vertical" /></div>
        <div className="mt-auto border-t border-border pt-6"><UserMenu user={{ displayName: ctx.displayName, role: ctx.role }} /></div>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <AppHeader section={currentSection} user={{ displayName: ctx.displayName, role: ctx.role }} />
        <main className="flex min-h-dvh min-w-0 flex-1 flex-col px-4 pt-20 pb-28 sm:px-6 lg:px-8">{children}</main>
      </div>
      <div className="lg:hidden"><BottomNav /></div>
      <Toaster position="top-center" />
    </div>
  );
}
