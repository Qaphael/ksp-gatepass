import { Panel } from "@/components/ui/panel";
import { cn } from "cn";

/**
 * MetricTile: a Panel-based metric display.
 * - Header: label (text-[12px] font-mono) + optional right slot
 * - Value block:
 *   - count: text-[28px] font-mono + suffix text-[12px]
 *   - money: "UGX" caption text-[12px], then value text-base
 * - Optional sub line (text-[12px])
 * - NO percent bar - stat cards are numbers only
 *
 * Tones: default (primary), success, warning, primary
 *
 * Variants:
 * - default: original Panel-based layout with larger value
 * - compact: p-3, label mono 12, value text-[28px] font-mono font-medium
 */
export function MetricTile({
  label,
  value,
  suffix,
  amount,
  sub,
  tone = "default",
  headerRight,
  className,
  variant = "default",
}: {
  label: string;
  value?: string;
  suffix?: string;
  amount?: number;
  sub?: string;
  tone?: "default" | "success" | "warning" | "primary";
  headerRight?: React.ReactNode;
  className?: string;
  variant?: "default" | "compact";
}) {
  const toneClasses = {
    default: "text-primary",
    success: "text-success",
    warning: "text-warning",
    primary: "text-primary",
  };

  if (variant === "compact") {
    return (
      <Panel className={cn("min-w-0 p-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[12px] text-muted-foreground">
            {label}
          </span>
          {headerRight && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              {headerRight}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className={cn("truncate font-mono text-[28px] font-medium tabular-nums", toneClasses[tone])}>
              {value}
            </span>
            {suffix && (
              <span className="truncate font-mono text-[12px] text-muted-foreground">
                {suffix}
              </span>
            )}
          </div>
        </div>

        {sub && (
          <span className="mt-2 truncate text-[12px] text-muted-foreground">
            {sub}
          </span>
        )}
      </Panel>
    );
  }

  return (
    <Panel className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between pb-2">
        <span className="truncate font-mono text-[12px] text-muted-foreground">
          {label}
        </span>
        {headerRight && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            {headerRight}
          </span>
        )}
      </div>

      {amount !== undefined ? (
        <div className="mt-2 flex flex-col gap-0.5">
          <span className="text-[12px] font-mono text-muted-foreground">UGX</span>
          <span
            className={cn(
              "truncate text-base font-mono font-medium tabular-nums",
              toneClasses[tone],
            )}
          >
            {amount.toLocaleString()}
          </span>
        </div>
      ) : (
        <div className="mt-2 flex items-baseline gap-1">
          <span className={cn("truncate font-mono text-[28px] font-medium tabular-nums")} >
            {value}
          </span>
          {suffix && (
            <span className="truncate font-mono text-[12px] text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
      )}

      {sub && (
        <span className="mt-2 truncate text-[12px] text-muted-foreground">
          {sub}
        </span>
      )}
    </Panel>
  );
}