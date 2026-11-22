import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Panel: a bordered container with three variants.
 * default: rounded-lg border bg-card p-4 (uses --card-padding)
 * well: nested container rounded-sm bg-muted/40 p-2
 * dim: inactive state bg-card/60
 *
 * Usage:
 *   <Panel>Content</Panel>
 *   <Panel variant="well">Nested content</Panel>
 *   <Panel variant="dim">Inactive section</Panel>
 */
export function Panel({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: "default" | "well" | "dim";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0",
        variant === "default" && "rounded-lg border border-border bg-card p-4",
        variant === "well" && "rounded-sm bg-muted/40 p-2",
        variant === "dim" && "bg-card/60",
        className,
      )}
    >
      {children}
    </div>
  );
}