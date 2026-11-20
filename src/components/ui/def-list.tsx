import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * A definition list that stacks (label above value) at 390px base and lays out
 * label-left / value-right from the `sm` breakpoint up.
 */
export function DefList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("divide-y divide-border", className)}>{children}</dl>;
}

export function DefRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4", className)}>
      <dt className="min-w-0 text-base text-muted-foreground sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-base text-foreground">{children}</dd>
    </div>
  );
}