import { cn } from "cn";

/**
 * TileRow: a list-row tile component.
 * - Container: flex items-center justify-between gap-2 rounded-sm bg-muted/50 p-3 min-h-14
 * - Left: icon tile (size-8 rounded-lg neutral) + two-line text (title + optional subtitle)
 * - Right: end-aligned two lines (value + optional time)
 *
 * Usage:
 *   <TileRow
 *     icon={<Check />}
 *     title="Customer Name"
 *     subtitle="REF-1234 · 2x VIP"
 *     rightValue="UGX 100,000"
 *     rightTime="14:22 EAT"
 *   />
 */
export function TileRow({
  icon,
  title,
  subtitle,
  rightValue,
  rightTime,
  tone = "default",
  iconSize = 8,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  rightValue: string;
  rightTime?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
  iconSize?: 8 | 9;
  className?: string;
}) {
  const sizeClasses = iconSize === 9 ? "size-9" : "size-8";

  const toneValueClasses = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    primary: "text-primary",
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-sm bg-muted/50 p-3 min-h-14",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            "flex items-center justify-center rounded-lg",
            "bg-muted",
            sizeClasses,
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="truncate text-sm font-medium text-foreground">
            {title}
          </span>
          {subtitle && (
            <span className="truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end text-right">
        <span className={cn("font-mono text-sm font-medium tabular-nums", toneValueClasses[tone])}>
          {rightValue}
        </span>
        {rightTime && (
          <span className="text-xs text-muted-foreground">{rightTime}</span>
        )}
      </div>
    </div>
  );
}

/**
 * TileRowList: wrapper for a list of tiles.
 * Usage:
 *   <TileRowList>
 *     <TileRow ... />
 *     <TileRow ... />
 *   </TileRowList>
 */
export function TileRowList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {children}
    </div>
  );
}