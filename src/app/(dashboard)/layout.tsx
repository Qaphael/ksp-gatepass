import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AppShell, type NavGroup, type NavIconName, type NavItem } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export const instant = false;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const permitted = (href: string, label: NavIconName, permission: Parameters<typeof can>[1]): NavItem | null =>
    can(ctx.role, permission) ? { href, label, icon: label } : null;

  const all = {
    overview: permitted("/dashboard", "Overview", "event:read"),
    sell: { href: "/sales/new", label: "Sell", icon: "Sell" as const },
    sales: permitted("/sales", "Sales", "sale:read-own"),
    tickets:
      can(ctx.role, "inventory:read") || can(ctx.role, "sale:read-own")
        ? { href: "/tickets", label: "Tickets", icon: "Tickets" as const }
        : null,
    stock:
      can(ctx.role, "stock:read-own") || can(ctx.role, "stock:read-all")
        ? { href: "/stock", label: "Stock", icon: "Stock" as const }
        : null,
    scan: permitted("/scanner", "Check-in", "checkin:verify"),
    manual: permitted("/check-in/manual", "Manual", "checkin:verify"),
    recent: permitted("/check-in/recent", "Recent", "checkin:read-recent"),
    attempts: permitted("/check-in/attempts", "Attempts", "checkin:read-attempts"),
    reports:
      can(ctx.role, "report:view-summary") ||
      can(ctx.role, "report:export-own") ||
      can(ctx.role, "report:export-full")
        ? { href: "/reports", label: "Reports", icon: "Reports" as const }
        : null,
    events: permitted("/events", "Events", "event:read"),
    team: permitted("/team", "Team", "user:read"),
    audit: permitted("/audit-logs", "Audit log", "audit:read"),
    settings: { href: "/account", label: "Settings", icon: "Settings" as const },
  };

  const collect = (...items: Array<NavItem | null>) =>
    items.filter((item): item is NavItem => Boolean(item));

  let groups: NavGroup[];
  if (ctx.role === "VERIFIER") {
    groups = [
      { label: "Gate", items: collect(all.overview, all.scan, all.manual, all.recent) },
      { label: "Account", items: [all.settings] },
    ];
  } else if (ctx.role === "SELLER") {
    groups = [
      { label: "Sales", items: collect(all.sell, all.sales, all.tickets, all.stock) },
      { label: "Account", items: [all.settings] },
    ];
  } else if (ctx.role === "SUPERVISOR") {
    groups = [
      { label: "Operations", items: collect(all.overview, all.scan, all.attempts, all.reports) },
      { label: "Account", items: [all.settings] },
    ];
  } else {
    groups = [
      { label: "Operations", items: collect(all.overview, all.sales, all.tickets, all.stock) },
      { label: "Gate", items: collect(all.scan, all.manual, all.recent, all.attempts) },
      { label: "Management", items: collect(all.events, all.team, all.reports, all.audit, all.settings) },
    ].filter((group) => group.items.length > 0);
  }

  const landing =
    ctx.role === "VERIFIER" ? "/scanner" : ctx.role === "SELLER" ? "/sales/new" : "/dashboard";

  return (
    <>
      <AppShell landing={landing} groups={groups} user={{ displayName: ctx.displayName, role: ctx.role }}>
        {children}
      </AppShell>
      <Toaster position="top-center" />
    </>
  );
}
