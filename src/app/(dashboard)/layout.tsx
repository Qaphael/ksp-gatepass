import Link from "next/link";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { NavLinks, type NavItem, NAV_ICONS } from "@/components/layout/nav-links";
import { UserMenu } from "@/components/layout/user-menu";
import { EventSwitcher } from "@/components/layout/event-switcher";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listEvents } from "@/server/services/events.service";

export const instant = false;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const events = can(ctx.role, "event:read") ? await listEvents(ctx) : [];
  const permitted = (href: string, label: keyof typeof NAV_ICONS, permission: Parameters<typeof can>[1]): NavItem | null =>
    can(ctx.role, permission) ? { href, label, icon: NAV_ICONS[label] } : null;
  const all = {
    overview: permitted("/dashboard", "Overview", "event:read"),
    sales: permitted("/sales", "Sales", "sale:read-own"),
    tickets: can(ctx.role, "inventory:read") || can(ctx.role, "sale:read-own") ? { href: "/tickets", label: "Tickets", icon: NAV_ICONS.Tickets } : null,
    scan: permitted("/scanner", "Check-in", "checkin:verify"),
    manual: permitted("/check-in/manual", "Manual", "checkin:verify"),
    recent: permitted("/check-in/recent", "Recent", "checkin:read-recent"),
    attempts: permitted("/check-in/attempts", "Attempts", "checkin:read-attempts"),
    reports: (can(ctx.role, "report:view-summary") || can(ctx.role, "report:export-own") || can(ctx.role, "report:export-full")) ? { href: "/reports", label: "Reports", icon: NAV_ICONS.Reports } : null,
    events: permitted("/events", "Events", "event:read"),
    team: permitted("/team", "Team", "user:read"),
    audit: permitted("/audit-logs", "Audit log", "audit:read"),
    settings: { href: "/account", label: "Settings", icon: NAV_ICONS["Audit log"] },
  };
  const collect = (...items: Array<NavItem | null>) => items.filter((item): item is NavItem => Boolean(item));
  let navItems: NavItem[];
  if (ctx.role === "VERIFIER") navItems = collect(all.scan, all.manual, all.recent);
  else if (ctx.role === "SELLER") navItems = collect({ href: "/sales/new", label: "Sell", icon: NAV_ICONS.Sales }, all.sales, all.tickets);
  else if (ctx.role === "SUPERVISOR") navItems = collect(all.overview, all.scan, all.attempts, all.reports);
  else navItems = collect(all.overview, all.sales, all.tickets, all.scan, all.events, all.team, all.audit, all.reports, all.settings);
  const landing = ctx.role === "VERIFIER" ? "/scanner" : ctx.role === "SELLER" ? "/sales/new" : "/dashboard";

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row" style={{ minHeight: "100dvh" }}>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-background px-4 py-5 lg:flex">
        <Link href={landing} className="mb-6 px-2 font-semibold tracking-tight">KSP GatePass</Link>
        <EventSwitcher events={events.map(({ id, name }) => ({ id, name }))} />
        <div className="mt-5"><NavLinks items={navItems} orientation="vertical" /></div>
        <div className="mt-auto border-t border-border pt-4"><UserMenu user={{ displayName: ctx.displayName, role: ctx.role }} /></div>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2 lg:hidden"><Link href={landing} className="shrink-0 font-semibold tracking-tight">KSP</Link><EventSwitcher events={events.map(({ id, name }) => ({ id, name }))} /></div>
            <div className="hidden min-w-0 items-center gap-3 lg:flex"><span className="truncate text-sm font-medium">{events.length ? "Event workspace" : "Operations"}</span></div>
            <span data-connection-indicator-slot="" className="ml-auto size-2 shrink-0" aria-hidden="true" />
            <UserMenu user={{ displayName: ctx.displayName, role: ctx.role }} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-6">{children}</main>
      </div>
      <div className="lg:hidden"><NavLinks items={navItems} /></div>
      <Toaster position="top-center" />
    </div>
  );
}
