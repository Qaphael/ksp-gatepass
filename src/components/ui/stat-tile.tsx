import { Card, CardContent } from "@/components/ui/card";
import { cn } from "cn";

/**
 * Compact metric tile: label, value with optional suffix and sub-line.
 * Stat cards are numbers only - no progress bars.
 */
export function StatTile({
  label,
  value,
  suffix,
  sub,
  className,
}: {
  label: string;
  value: string;
  suffix?: string;
  sub?: string;
  className?: string;
}) {
  return (
    <Card className="min-w-0 p-3">
      <CardContent className={cn("flex flex-col gap-1.5", className)}>
        <span className="truncate font-mono text-[12px] text-muted-foreground">{label}</span>
        <span className="flex items-baseline gap-1">
          <span className="truncate text-2xl font-medium tabular-nums sm:text-3xl">{value}</span>
          {suffix && <span className="truncate text-xs font-mono text-muted-foreground">{suffix}</span>}
        </span>
        {sub && <span className="truncate text-[12px] text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  );
}