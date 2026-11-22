"use client";

import Link from "next/link";
import { cn } from "cn";

interface SegmentedLink {
  href: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  active?: boolean;
}

interface SegmentedLinksProps {
  links: SegmentedLink[];
  className?: string;
}

export function SegmentedLinks({ links, className }: SegmentedLinksProps) {
  return (
    <nav className={cn("flex h-11 rounded-lg bg-muted p-1", className)} role="tablist" aria-label="Ticket scope">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.active ? "page" : undefined}
          className={cn(
            "flex min-h-full flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-mono font-semibold transition-colors",
            link.active
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          {link.icon && <span aria-hidden="true">{link.icon}</span>}
          {link.label}
          {link.count !== undefined && link.active && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-muted px-1.5 text-[10px] font-mono font-semibold">
              {link.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}