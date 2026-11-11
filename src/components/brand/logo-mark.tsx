import { cn } from "@/lib/utils";
import { LOGO_MARK, type LogoMarkVariant } from "@/lib/brand/logo-mark";

type LogoMarkProps = {
  /** "small" has a wider gap and reads better under about 40 px. */
  variant?: LogoMarkVariant;
  /** Provide a title only when the mark is the sole content (for example an icon-only link). Otherwise it is decorative. */
  title?: string;
  className?: string;
};

/** The KSP GatePass mark. Colour comes from `currentColor`, so use text-* token classes. */
export function LogoMark({ variant = "default", title, className }: LogoMarkProps) {
  return (
    <svg
      viewBox={LOGO_MARK.viewBox}
      fill="currentColor"
      focusable="false"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("size-8 shrink-0", className)}
    >
      {title ? <title>{title}</title> : null}
      {LOGO_MARK[variant].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Mark plus the product name. Use where there is room (sidebar, sign-in). */
export function BrandLockup({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("size-8 text-primary", markClassName)} />
      <span className={cn("font-semibold tracking-tight", textClassName)}>KSP GatePass</span>
    </span>
  );
}
