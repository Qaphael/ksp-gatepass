import { Card, CardContent } from "@/components/ui/card";
import { cn } from "cn";

/**
 * Compact metric tile: label, value with optional suffix and sub-line, and an
 * optional integer progress bar. The percent is a display-only value between
 * 0 and 100; it must never be fed back into logic.
 */
export function StatTile({
  label,
  value,
  suffix,
  sub,
  percent,
  className,
}: {
  label: string;
  value: string;
  suffix?: string;
  sub?: string;
  /** Integer 0–100, display only. */
  percent?: number;
  className?: string;
}) {
  const clamped = percent === undefined ? undefined : Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <Card size="sm" className="min-w-0">
      <CardContent className={cn("flex flex-col gap-1.5", className)}>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{label}</span>
        <span className="flex items-baseline gap-1">
          <span className="truncate text-lg font-semibold tabular-nums sm:text-xl">{value}</span>
          {suffix && <span className="truncate text-xs font-mono text-muted-foreground">{suffix}</span>}
        </span>
        {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
        {clamped !== undefined && (
          <div aria-hidden="true" className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}