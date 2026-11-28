"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Ellipsis,
  FileBarChart,
  History,
  LayoutDashboard,
  ListChecks,
  Package,
  ScanLine,
  ScanSearch,
  ScrollText,
  Settings,
  ShoppingCart,
  Ticket,
  Users,
} from "lucide-react";
import { cn } from "cn";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type NavIconName =
  | "Overview"
  | "Sell"
  | "Sales"
  | "Tickets"
  | "Check-in"
  | "Manual"
  | "Recent"
  | "Attempts"
  | "Reports"
  | "Events"
  | "Team"
  | "Audit log"
  | "Settings"
  | "Stock";

export interface NavItem {
  href: string;
  label: string;
  icon?: NavIconName;
}

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

const isActive = (pathname: string, href: string) =>
  pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

/** Desktop rail. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex w-full flex-col gap-1">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon ?? "Overview"];
        const active = isActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile bottom bar: 3 primary destinations plus the rest behind More. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = items.slice(0, 3);
  const moreItems = items.slice(3);
  const tabCount = primary.length + (moreItems.length > 0 ? 1 : 0);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 pb-safe backdrop-blur-xl">
      <div
        className="mx-auto grid h-16 max-w-lg items-center gap-1 px-2"
        style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
      >
        {primary.map((item) => (
          <Tab
            key={item.href}
            href={item.href}
            label={item.label}
            icon={NAV_ICONS[item.icon ?? "Overview"]}
            active={isActive(pathname, item.href)}
          />
        ))}
        {moreItems.length > 0 && (
          <TabButton
            label="More"
            icon={Ellipsis}
            active={moreItems.some((item) => isActive(pathname, item.href))}
            onClick={() => setMoreOpen(true)}
          />
        )}
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-sm"
        >
          <SheetHeader className="px-0 pt-0">
            <SheetTitle>All areas</SheetTitle>
          </SheetHeader>
          <nav aria-label="All areas" className="grid gap-1 overflow-y-auto">
            {moreItems.map((item) => {
              const Icon = NAV_ICONS[item.icon ?? "Overview"];
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full min-h-12 flex-col items-center justify-center gap-0.5 rounded-md transition-colors",
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="max-w-full truncate text-xs">{label}</span>
    </Link>
  );
}

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full min-h-12 flex-col items-center justify-center gap-0.5 rounded-md transition-colors",
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="max-w-full truncate text-xs">{label}</span>
    </button>
  );
}
