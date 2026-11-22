import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * PanelHeader: flexible header for panels.
 * Default: flex items-center justify-between pb-2
 *   - Left: optional icon + h2 (text-base font-semibold)
 *   - Right: children slot (meta, link) in text-[11px] font-mono
 * "outside" variant: px-1, no card (for section labels above Panel)
 *
 * Usage:
 *   <PanelHeader icon={<Check />} title="Stats" />
 *   <PanelHeader title="Stats"><Chip status="ok" /></PanelHeader>
 *   <PanelHeader variant="outside">Ticket categories · 3</PanelHeader>
 */
export function PanelHeader({
  icon,
  title,
  children,
  variant = "default",
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  variant?: "default" | "outside";
  className?: string;
}) {
  if (variant === "outside") {
    return (
      <div
        className={cn(
          "flex items-center justify-between px-1 text-sm font-semibold text-foreground",
          className,
        )}
      >
        <span className="truncate">{title}</span>
        {children && (
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
            {children}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between pb-2",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon && (
          <span
            className="flex size-5 items-center justify-center text-muted-foreground"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <h2 className="truncate text-base font-semibold text-foreground">
          {title}
        </h2>
      </div>
      {children && (
        <span
          className={cn(
            "flex items-center gap-1 whitespace-nowrap font-mono text-[11px] text-muted-foreground",
            children instanceof HTMLAnchorElement ||
              (typeof children === "string" && children.includes("→"))
              ? "min-h-11 px-1.5 py-0.5"
              : "",
          )}
        >
          {children}
        </span>
      )}
    </div>
  );
}