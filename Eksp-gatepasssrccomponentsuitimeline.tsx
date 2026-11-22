import { cn } from "cn";

const toneClasses = {
  success: "bg-success ring-success",
  primary: "bg-primary ring-primary",
  neutral: "bg-muted-foreground ring-muted-foreground",
  destructive: "bg-destructive ring-destructive",
} as const;

type Tone = keyof typeof toneClasses;

export interface TimelineItem {
  id: string;
  tone: Tone;
  title: string;
  time: string;
  detail?: string;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative pl-6 space-y-5" role="list">
      {/* Vertical line */}
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" aria-hidden="true" />
      {items.map((item) => (
        <li key={item.id} className="relative">
          {/* Dot with ring */}
          <div
            className={cn(
              "absolute left-0 top-1 size-3.5 rounded-full border-4 flex-shrink-0",
              toneClasses[item.tone],
              "ring-4 ring-background"
            )}
            aria-hidden="true"
          />
          <div className="ml-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[13px] font-mono font-semibold">{item.title}</h3>
              <time className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                {item.time}
              </time>
            </div>
            {item.detail && (
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
