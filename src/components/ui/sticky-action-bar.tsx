import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Sticky bottom action bar. Borders on top, respects the iOS safe area, and is
 * hidden at `lg` and above unless `showAtLg` is set.
 */
export function StickyActionBar({
  children,
  className,
  showAtLg = false,
}: {
  children: ReactNode;
  className?: string;
  showAtLg?: boolean;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur",
        !showAtLg && "lg:hidden",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3">{children}</div>
    </div>
  );
}