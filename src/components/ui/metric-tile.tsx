import { Panel } from "@/components/ui/panel";
import { cn } from "cn";

/**
 * MetricTile: a Panel-based metric display.
 * - Header: label (text-[11px] font-mono) + optional right slot
 * - Value block:
 *   - count: text-[22px] font-mono + suffix text-[11px]
 *   - money: "UGX" caption text-[11px], then value text-base
 * - Optional sub line (text-xs)
 * - Optional integer percent bar (tone-colored fill)
 *
 * Tones: default (primary), success, warning, primary
 *
 * Variants:
 * - default: original Panel-based layout with larger value
 * - compact: p-3, label caps mono 11, icon right 18, value text-[16px] font-mono font-bold + right-aligned percent
 */
export function MetricTile({
  label,
  value,
  suffix,
  amount,
  sub,
  percent,
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
  percent?: number;
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

  const barClasses = {
    default: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    primary: "bg-primary",
  };

  const clamped =
    percent === undefined ? undefined : Math.min(100, Math.max(0, Math.round(percent)));

  if (variant === "compact") {
    return (
      <Panel className={cn("min-w-0 p-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
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
            <span className={cn("truncate font-mono text-[16px] font-bold tabular-nums", toneClasses[tone])}>
              {value}
            </span>
            {suffix && (
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {suffix}
              </span>
            )}
          </div>
          {clamped !== undefined && (
            <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
              <span className={cn("font-mono text-[11px] font-bold", toneClasses[tone])}>
                {clamped}%
              </span>
            </div>
          )}
        </div>

        {sub && (
          <span className="mt-1 truncate text-[11px] text-muted-foreground">
            {sub}
          </span>
        )}
      </Panel>
    );
  }

  return (
    <Panel className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between pb-2">
        <span className="truncate font-mono text-[11px] text-muted-foreground">
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
          <span className="text-[11px] font-mono text-muted-foreground">UGX</span>
          <span
            className={cn(
              "truncate text-base font-mono font-semibold tabular-nums",
              toneClasses[tone],
            )}
          >
            {amount.toLocaleString()}
          </span>
        </div>
      ) : (
        <div className="mt-2 flex items-baseline gap-1">
          <span className={cn("truncate font-mono text-[22px] font-semibold tabular-nums")} >
            {value}
          </span>
          {suffix && (
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
      )}

      {sub && (
        <span className="mt-2 truncate text-xs text-muted-foreground">
          {sub}
        </span>
      )}

      {clamped !== undefined && (
        <div aria-hidden="true" className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", barClasses[tone])} style={{ width: `${clamped}%` }} />
        </div>
      )}
    </Panel>
  );
}