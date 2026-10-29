"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ClipboardList, Ellipsis, FileBarChart, History, LayoutDashboard, ListChecks, ScanLine, ScanSearch, ScrollText, Settings, ShoppingCart, Ticket, Users, X, CalendarDays } from "lucide-react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type NavIconName = "Overview" | "Sell" | "Sales" | "Tickets" | "Check-in" | "Manual" | "Recent" | "Attempts" | "Reports" | "Events" | "Team" | "Audit log" | "Settings";
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
};

export function NavLinks({ items, orientation = "horizontal" }: { items: NavItem[]; orientation?: "horizontal" | "vertical" }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const mainItems = items.filter((item) => item.href !== "/events" && item.href !== "/team" && item.href !== "/audit-logs" && item.href !== "/reports" && item.href !== "/account");
  const moreItems = items.filter((item) => !mainItems.includes(item));
  const isMoreActive = moreItems.some((item) => pathname === item.href || pathname.startsWith(item.href));
  const more = <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
    <DialogTrigger className={cn("flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground", isMoreActive && "bg-muted font-medium text-foreground")} aria-label="More navigation">
      <Ellipsis className="size-5"/><span>More</span>
    </DialogTrigger>
    <DialogContent showCloseButton={false} className="inset-x-0 bottom-0 top-auto left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 gap-4 rounded-t-2xl rounded-b-none border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:inset-x-1/2 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
      <div className="flex items-center justify-between"><DialogTitle>More areas</DialogTitle><button onClick={() => setMoreOpen(false)} className="grid size-11 place-items-center rounded-md hover:bg-muted" aria-label="Close menu"><X className="size-5"/></button></div>
      <nav aria-label="More" className="grid gap-1">{moreItems.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href)} onNavigate={() => setMoreOpen(false)} compact={false}/>)}</nav>
    </DialogContent>
  </Dialog>;
  if (orientation === "vertical") return <nav aria-label="Main" className="flex w-full flex-col gap-1">{items.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))} compact={false}/>)}</nav>;
  return <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pt-1 backdrop-blur lg:hidden" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}>
    <div className="mx-auto flex max-w-lg items-stretch justify-around">{mainItems.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))} compact/>)}{moreItems.length ? more : null}</div>
  </nav>;
}

function NavLink({ item, active, onNavigate, compact = true }: { item: NavItem; active: boolean; onNavigate?: () => void; compact?: boolean }) {
  const Icon = item.icon ? NAV_ICONS[item.icon] : LayoutDashboard;
  return <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(compact ? "flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 rounded-lg px-2 text-base" : "flex min-h-12 items-center gap-3 rounded-lg px-3 text-base", "transition-colors", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}><Icon className="size-5 shrink-0"/><span>{item.label}</span></Link>;
}
