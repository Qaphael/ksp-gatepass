"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({
  items,
  orientation = "horizontal",
}: {
  items: NavItem[];
  orientation?: "horizontal" | "vertical";
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex gap-1",
        orientation === "horizontal"
          ? "-mx-1 items-center overflow-x-auto px-1"
          : "w-full flex-col",
      )}
    >
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
