"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { Badge } from "@/components/reui/badge";
import { UserMenu } from "@/components/layout/user-menu";

import type { Role } from "@/generated/prisma/client";

export function AppHeader({ section, user }: { section?: string; user: { displayName: string; role: Role } }) {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border bg-background/90 pt-safe backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" aria-label="KSP GatePass home" className="flex min-w-0 items-center gap-2">
            <LogoMark className="size-6 shrink-0 text-primary" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold text-foreground">KSP GatePass</span>
              {section && <Badge variant="secondary" className="w-fit">{section}</Badge>}
            </div>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
