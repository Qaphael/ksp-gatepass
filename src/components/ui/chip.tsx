import { Badge } from "@/components/reui/badge";
import type { ReactNode } from "react";

/**
 * Chip: a small state label, rendered as a ReUI Badge.
 * - Variants: success | warning | destructive | info | neutral
 * - Icon or label + text
 */
export function Chip({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "destructive" | "info" | "neutral";
  icon?: ReactNode;
  className?: string;
}) {
  const variant = {
    success: "success-light",
    warning: "warning-light",
    destructive: "destructive-light",
    info: "info-light",
    neutral: "secondary",
  } as const;

  return (
    <Badge variant={variant[tone]} className={className}>
      {icon}
      {children}
    </Badge>
  );
}
