import type { ReactNode } from "react";
import { Frame, FramePanel } from "@/components/reui/frame";
import { cn } from "cn";

/**
 * Panel: a ReUI Frame (or FramePanel) container with three variants.
 * default: Frame > FramePanel (uses --frame-* tokens)
 * well: nested container rounded-sm bg-muted/40 p-2 (no border, inset)
 * dim: inactive state bg-card/60 (no border)
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
  if (variant === "well") {
    return (
      <div className={cn("min-w-0 rounded-sm bg-muted/40 p-2", className)}>
        {children}
      </div>
    );
  }
  if (variant === "dim") {
    return (
      <div className={cn("min-w-0 bg-card/60", className)}>{children}</div>
    );
  }
  return (
    <Frame className={cn("min-w-0 [--frame-radius:var(--radius-lg)]", className)}>
      <FramePanel>{children}</FramePanel>
    </Frame>
  );
}
