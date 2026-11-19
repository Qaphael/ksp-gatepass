"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Activity, QrCode, Settings } from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";

const NAV_ITEMS: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/sales", label: "Sales", icon: Activity },
  { href: "/scanner", label: "Scanner", icon: QrCode },
  { href: "/account", label: "Account", icon: Settings },
];

import type { Role } from "@/generated/prisma/client";

export function AppHeader({ section, user }: { section?: string; user: { displayName: string; role: Role } }) {
  const pathname = usePathname();
  return (
    <header className="fixed top-0 w-full z-50 pt-safe bg-background/90 backdrop-blur-xl border-b border-border">
      <div className="h-16 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" aria-label="KSP GatePass home" className="flex items-center gap-2">
            <LogoMark className="size-6 text-primary" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">KSP GatePass</span>
              {section && (
                <span className="text-[10px] font-mono text-muted-foreground truncate uppercase tracking-wider">{section}</span>
              )}
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <nav className="fixed bottom-0 w-full z-50 pb-safe bg-background/90 backdrop-blur-xl border-t border-border">
      <div className="h-16 px-3 grid grid-cols-4 items-center">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "min-h-[48px] h-full flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
                active
                  ? "text-primary bg-accent font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="text-[10px] font-mono font-medium uppercase tracking-wider">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
