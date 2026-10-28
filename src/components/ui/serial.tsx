export function Serial({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums tracking-[0.08em] ${className ?? ""}`.trim()}>
      {children}
    </span>
  );
}
