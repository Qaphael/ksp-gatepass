"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { UserMenu } from "@/components/layout/user-menu";

import type { Role } from "@/generated/prisma/client";

export function AppHeader({ section, user }: { section?: string; user: { displayName: string; role: Role } }) {
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
