"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays, ClipboardList, Ellipsis, FileBarChart, History, LayoutDashboard, ListChecks, Package, ScanLine, ScanSearch, ScrollText, Settings, ShoppingCart, Ticket, Users, X } from "lucide-react";
import type { NavItem } from "@/components/layout/nav-links";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
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

/**
 * Mobile-only primary navigation.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // The top header already exposes the user/Account menu, so keep the bottom
  // bar to the three highest-priority destinations and move the rest into the
  // More sheet (Account still appears there if it's part of this role's nav).
  const primary = items.slice(0, 3);
  const moreItems = items.slice(3);
  const tabCount = primary.length + (moreItems.length > 0 ? 1 : 0);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 pb-safe backdrop-blur-xl">
      <div
        className="mx-auto grid h-16 max-w-lg items-center px-2"
        style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
      >
        {primary.map((item) => (
          <Tab key={item.href} href={item.href} label={item.label} icon={NAV_ICONS[item.icon ?? "Overview"]} active={isActive(item.href)} />
        ))}
        {moreItems.length > 0 && <TabButton label="More" icon={Ellipsis} active={moreItems.some((i) => isActive(i.href))} onClick={() => setMoreOpen(true)} />}
      </div>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent showCloseButton={false} className="inset-x-0 bottom-0 top-auto left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 gap-3 rounded-t-lg rounded-b-none border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:inset-x-1/2 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold">All areas</DialogTitle>
            <button onClick={() => setMoreOpen(false)} className="grid size-11 place-items-center rounded-md hover:bg-muted" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
          <nav aria-label="All areas" className="grid gap-1">
            {moreItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-lg px-3 text-base transition-colors",
                    active ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {(() => { const Icon = NAV_ICONS[item.icon ?? "Overview"]; return <Icon className="size-5 shrink-0" />; })()}
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </DialogContent>
      </Dialog>
    </nav>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[48px] h-full flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
        active ? "text-primary bg-accent font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="max-w-full truncate text-[10px] font-mono font-medium uppercase tracking-wider">{label}</span>
    </Link>
  );
}

function TabButton({ label, icon: Icon, active, onClick }: { label: string; icon: React.ComponentType<{ className?: string }>; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[48px] h-full flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
        active ? "text-primary bg-accent font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="max-w-full truncate text-[10px] font-mono font-medium uppercase tracking-wider">{label}</span>
    </button>
  );
}