import Link from "next/link";
import { cn } from "cn";
import type { ReactNode } from "react";

export interface SegmentedLinkItem {
  href: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export function SegmentedLinks({
  items,
  className,
}: {
  items: SegmentedLinkItem[];
  className?: string;
}) {
  return (
    <nav className={cn("rounded-lg bg-muted p-1 flex gap-1", className)} aria-label="Segmented navigation">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "min-h-11 flex-1 rounded-md text-[11px] font-mono flex items-center justify-center gap-1.5",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "aria-current:bg-card aria-current:text-foreground"
          )}
          aria-current={item.count !== undefined ? undefined : undefined}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.count !== undefined && (
            <span
              className="inline-flex min-h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-mono bg-muted/50 text-muted-foreground"
            >
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
