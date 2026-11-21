"use client";

import { useEffect, useState } from "react";

/** Live Africa/Kampala clock rendered in kiosk-style server/status stamps. */
export function EatClock() {
  // Rendered only after mount so server and client trees match (no hydration mismatch).
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const text = now
    ? now.toLocaleTimeString("en-GB", { timeZone: "Africa/Kampala", hour12: false })
    : "--:--:--";

  return (
    <span aria-live="off" className="font-mono text-sm tabular-nums text-foreground">
      {text} EAT
    </span>
  );
}
