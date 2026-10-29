"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/role";
import type { Role } from "@/generated/prisma/client";

interface UserMenuProps {
  user: {
    displayName: string;
    role: Role;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const result = await apiFetch("/api/v1/auth/logout", {
        method: "POST",
        signal: controller.signal,
      });
      if (!result.ok) {
        setSignOutError(result.error.message);
        setMenuOpen(true);
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Check your connection and try again.");
      setMenuOpen(true);
    } finally {
      window.clearTimeout(timeout);
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" aria-label="Account menu" disabled={signingOut}>
            <UserRound />
          <span className="hidden max-w-32 truncate sm:inline sm:max-w-none">
              {user.displayName}
            </span>
            <ChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="truncate font-medium">{user.displayName}</p>
            <p className="text-xs font-normal text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {signOutError ? (
          <p role="alert" className="px-2 py-1.5 text-xs text-destructive">
            {signOutError}
          </p>
        ) : null}
        <DropdownMenuItem render={<Link href="/account" />}>
          <UserRound /> Account
        </DropdownMenuItem>
        <DropdownMenuItem disabled={signingOut} onClick={() => void signOut()}>
          <LogOut /> {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
