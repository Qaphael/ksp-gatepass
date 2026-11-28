import type { ReactNode } from "react";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { cn } from "cn";

/**
 * A Frame with a standard header: title, optional description and an optional
 * right-side action slot.
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Frame className={cn("min-w-0", className)}>
      <FramePanel>
        <FrameHeader>
          <FrameTitle className="min-w-0">
            <span className="flex min-w-0 items-center justify-between gap-4">
              <span className="truncate">{title}</span>
              {action}
            </span>
          </FrameTitle>
          {description ? <FrameDescription>{description}</FrameDescription> : null}
        </FrameHeader>
        {children ? <div className={cn("flex min-w-0 flex-1 flex-col gap-4", contentClassName)}>{children}</div> : null}
      </FramePanel>
    </Frame>
  );
}
