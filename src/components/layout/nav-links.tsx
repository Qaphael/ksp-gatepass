"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ClipboardList, Ellipsis, FileBarChart, History, LayoutDashboard, ListChecks, ScanLine, ScanSearch, ScrollText, Settings, ShoppingCart, Ticket, Users, X, CalendarDays, Package } from "lucide-react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type NavIconName = "Overview" | "Sell" | "Sales" | "Tickets" | "Check-in" | "Manual" | "Recent" | "Attempts" | "Reports" | "Events" | "Team" | "Audit log" | "Settings" | "Stock";
export interface NavItem { href: string; label: string; icon?: NavIconName; }

const NAV_ICONS: Record<NavIconName, React.ComponentType<{ className?: string }>> = {
  Overview: LayoutDashboard,
  Sell: ShoppingCart,
  Sales: ClipboardList,
  Tickets: Ticket,
  "Check-in": ScanLine,
  Manual: ListChecks,
  Recent: History,
  Attempts: ScanSearch,
  Reports: FileBarChart,
  Events: CalendarDays,
  Team: Users,
  "Audit log": ScrollText,
  Settings,
  Stock: Package,
};

export function NavLinks({ items, orientation = "horizontal" }: { items: NavItem[]; orientation?: "horizontal" | "vertical" }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const mainItems = items.filter((item) => item.href !== "/events" && item.href !== "/team" && item.href !== "/audit-logs" && item.href !== "/reports" && item.href !== "/account" && item.href !== "/stock");
  const moreItems = items.filter((item) => !mainItems.includes(item));
  const isMoreActive = moreItems.some((item) => pathname === item.href || pathname.startsWith(item.href));
  const more = <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
    <DialogTrigger className={cn("flex min-h-12 min-w-12 max-w-14 flex-1 items-center justify-center rounded-[12px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground", isMoreActive && "bg-primary font-semibold text-primary-foreground")} aria-label="More navigation">
      <Ellipsis className="size-5"/><span className="sr-only">More</span>
    </DialogTrigger>
    <DialogContent showCloseButton={false} className="inset-x-0 bottom-0 top-auto left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 gap-4 rounded-t-[18px] rounded-b-none border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:inset-x-1/2 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[18px]">
      <div className="flex items-center justify-between"><DialogTitle>More areas</DialogTitle><button onClick={() => setMoreOpen(false)} className="grid size-11 place-items-center rounded-md hover:bg-muted" aria-label="Close menu"><X className="size-5"/></button></div>
      <nav aria-label="More" className="grid gap-1">{moreItems.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href)} onNavigate={() => setMoreOpen(false)} compact={false}/>)}</nav>
    </DialogContent>
  </Dialog>;
  if (orientation === "vertical") return <nav aria-label="Main" className="flex w-full flex-col gap-1">{items.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))} compact={false} sidebar/>)}</nav>;
  return <nav aria-label="Main" className="fixed inset-x-4 bottom-2 z-40 rounded-[18px] border border-border/80 bg-card/95 p-1 shadow-card backdrop-blur lg:hidden" style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}>
    <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1">{mainItems.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))} compact/>)}{moreItems.length ? more : null}</div>
  </nav>;
}

function NavLink({ item, active, onNavigate, compact = true, sidebar = false }: { item: NavItem; active: boolean; onNavigate?: () => void; compact?: boolean; sidebar?: boolean }) {
  const Icon = item.icon ? NAV_ICONS[item.icon] : LayoutDashboard;
  const activeClass = sidebar ? "bg-sidebar-accent font-semibold text-sidebar-primary" : compact ? "bg-primary font-semibold text-primary-foreground" : "bg-accent font-semibold text-primary";
  const inactiveClass = sidebar ? "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground";
  const mobileLayout = compact
    ? "flex min-h-12 min-w-12 max-w-14 flex-1 items-center justify-center rounded-[12px] px-1"
    : "flex min-h-12 items-center gap-3 rounded-xl px-3 text-base";
  return <Link href={item.href} onClick={onNavigate} aria-label={compact ? item.label : undefined} title={compact ? item.label : undefined} aria-current={active ? "page" : undefined} className={cn(mobileLayout, "transition-colors", active ? activeClass : inactiveClass, active && !sidebar && "shadow-sm")}><Icon className="size-5 shrink-0"/><span className={compact ? "sr-only" : undefined}>{item.label}</span></Link>;
}
