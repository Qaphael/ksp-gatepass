"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  ClipboardListIcon,
  EllipsisIcon,
  FileBarChartIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  PackageIcon,
  ScanLineIcon,
  ScanSearchIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShoppingCartIcon,
  TicketIcon,
  UsersIcon,
} from "lucide-react";
import { Frame, FramePanel } from "@/components/reui/frame";
import { LogoMark } from "@/components/brand/logo-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Role } from "@/generated/prisma/client";

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
  icon: NavIconName;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_ICONS: Record<NavIconName, ReactNode> = {
  Overview: <LayoutDashboardIcon aria-hidden="true" />,
  Sell: <ShoppingCartIcon aria-hidden="true" />,
  Sales: <ClipboardListIcon aria-hidden="true" />,
  Tickets: <TicketIcon aria-hidden="true" />,
  "Check-in": <ScanLineIcon aria-hidden="true" />,
  Manual: <ListChecksIcon aria-hidden="true" />,
  Recent: <HistoryIcon aria-hidden="true" />,
  Attempts: <ScanSearchIcon aria-hidden="true" />,
  Reports: <FileBarChartIcon aria-hidden="true" />,
  Events: <CalendarDaysIcon aria-hidden="true" />,
  Team: <UsersIcon aria-hidden="true" />,
  "Audit log": <ScrollTextIcon aria-hidden="true" />,
  Settings: <SettingsIcon aria-hidden="true" />,
  Stock: <PackageIcon aria-hidden="true" />,
};

const ROUTE_TITLES: Array<[string, string]> = [
  ["/dashboard", "Overview"],
  ["/sales/new", "New sale"],
  ["/sales", "Sales"],
  ["/tickets/new", "Generate tickets"],
  ["/tickets/batches", "Ticket batch"],
  ["/tickets", "Tickets"],
  ["/scanner", "Gate scanner"],
  ["/check-in/manual", "Manual check-in"],
  ["/check-in/recent", "Recent check-ins"],
  ["/check-in/attempts", "Scan attempts"],
  ["/events/new", "New event"],
  ["/events", "Events"],
  ["/stock", "Seller stock"],
  ["/team", "Team"],
  ["/audit-logs", "Audit log"],
  ["/reports", "Reports"],
  ["/account", "Account"],
];

function isRouteActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/sales/new") return pathname === "/sales/new";
  if (href === "/sales") return pathname === "/sales" || (pathname.startsWith("/sales/") && !pathname.startsWith("/sales/new"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolvePageTitle(pathname: string): string {
  for (const [prefix, title] of ROUTE_TITLES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return title;
    }
  }
  return "Operations";
}

export function AppShell({
  landing,
  groups,
  user,
  children,
}: {
  landing: string;
  groups: NavGroup[];
  user: { displayName: string; role: Role };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const pageTitle = resolvePageTitle(pathname);

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link href={landing} />}>
                <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <LogoMark className="size-4" />
                </span>
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">KSP GatePass</span>
                  <span className="text-sidebar-foreground/70 truncate text-xs">
                    KSP Hotel Gulu
                  </span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent role="navigation" aria-label="Main navigation">
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isRouteActive(pathname, item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
                          isActive={active}
                        >
                          {NAV_ICONS[item.icon]}
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator className="mx-0" />
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <UserMenu user={user} />
            <ThemeToggle />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="my-auto h-4" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">
                <BreadcrumbLink render={<Link href={landing} />} className="truncate">
                  KSP GatePass
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">{pageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 pb-24 sm:p-6 md:pb-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            {children}
          </div>
        </main>
      </SidebarInset>

      <MobileBottomNav groups={groups} />
    </SidebarProvider>
  );
}

function MobileBottomNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const allItems = groups.flatMap((group) => group.items);
  const primary = allItems.slice(0, 4);
  const hasMore = allItems.length > 4;
  const cols = primary.length + (hasMore ? 1 : 0);

  if (primary.length === 0) return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <Frame spacing="sm" className="bg-sidebar/95 shadow-lg backdrop-blur-md">
        <FramePanel className="bg-sidebar p-1">
          <div
            className="grid items-center gap-1"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {primary.map((item) => {
              const active = isRouteActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors [&>svg]:size-4 [&>svg]:shrink-0"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs transition-colors [&>svg]:size-4 [&>svg]:shrink-0"
                  }
                >
                  {NAV_ICONS[item.icon]}
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
            {hasMore ? (
              <button
                type="button"
                onClick={() => setOpenMobile(true)}
                className="text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs transition-colors"
              >
                <EllipsisIcon className="size-4 shrink-0" aria-hidden="true" />
                <span>More</span>
              </button>
            ) : null}
          </div>
        </FramePanel>
      </Frame>
    </nav>
  );
}
