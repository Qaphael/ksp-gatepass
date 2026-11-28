import type { ReactNode } from "react";
import { cn } from "cn";

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
          "text-foreground flex items-center justify-between px-1 text-sm font-semibold",
          className,
        )}
      >
        <span className="truncate">{title}</span>
        {children ? (
          <span className="text-muted-foreground ml-2 font-mono text-xs">{children}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-between gap-2 pb-2", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon ? (
          <span
            className="text-muted-foreground flex size-5 items-center justify-center"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <h2 className="text-foreground truncate text-base font-semibold">{title}</h2>
      </div>
      {children ? (
        <span className="text-muted-foreground flex items-center gap-1 whitespace-nowrap font-mono text-xs">
          {children}
        </span>
      ) : null}
    </div>
  );
}
