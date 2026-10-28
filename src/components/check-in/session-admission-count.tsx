"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readSessionAdmissionCount, SESSION_COUNT_EVENT, subscribeStorageEvents } from "@/components/check-in/session-storage";

export function SessionAdmissionCount({ eventId }: { eventId: string }) {
  const subscribe = useCallback((callback: () => void) => subscribeStorageEvents(callback, SESSION_COUNT_EVENT), []);
  const count = useSyncExternalStore(subscribe, () => readSessionAdmissionCount(eventId), () => 0);
  return <div className="rounded-lg border bg-card p-3" aria-live="polite"><p className="text-sm text-muted-foreground">Admitted this session</p><p className="text-xl font-semibold tabular-nums">{count}</p></div>;
}
