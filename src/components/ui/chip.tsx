import { cn } from "cn";

/**
 * Chip: a small state/info label.
 * - Classes: inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-[12px] font-mono
 * - Icon or dot + label
 * - Tones: success | warning | destructive | info | neutral
 *
 * Usage:
 *   <Chip tone="success">Paid</Chip>
 *   <Chip tone="warning" icon={<Alert />}>Pending</Chip>
 *   <Chip tone="neutral">VIP Access</Chip>
 */
export function Chip({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "destructive" | "info" | "neutral";
  icon?: React.ReactNode;
  className?: string;
}) {
  const toneClasses = {
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    info: "bg-info/10 text-info",
    neutral: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-[12px] font-mono",
        toneClasses[tone],
        className,
      )}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}