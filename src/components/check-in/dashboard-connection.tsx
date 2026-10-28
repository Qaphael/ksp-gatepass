"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { GATE_EVENT, readGate, subscribeStorageEvents } from "@/components/check-in/session-storage";

export function DashboardConnection({ eventId }: { eventId: string }) {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let live = true;
    async function beat() {
      try {
        const response = await fetch("/api/v1/auth/me", { cache: "no-store", headers: { accept: "application/json" } });
        if (live) setOnline(response.ok);
      } catch {
        if (live) setOnline(false);
      }
    }
    void beat();
    const timer = window.setInterval(() => void beat(), 8_000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  return <div className="grid gap-2">
    <div role="status" aria-live="polite" className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${online ? "border-success/40 bg-success/10 text-success-foreground" : "border-warning/50 bg-warning/10 text-warning-foreground"}`}>
    {online ? <Wifi aria-hidden="true" className="size-5" /> : <WifiOff aria-hidden="true" className="size-5" />}
    {online ? "Connected to admission service" : "Connection unavailable — check-in needs a server connection"}
    </div>
    <GateLabel eventId={eventId} />
  </div>;
}

function GateLabel({ eventId }: { eventId: string }) {
  const subscribe = useCallback((callback: () => void) => subscribeStorageEvents(callback, GATE_EVENT), []);
  const gate = useSyncExternalStore(subscribe, () => readGate(eventId), () => "");
  return <p className="text-sm text-muted-foreground">Gate / station: <span className="font-medium text-foreground">{gate || "Choose a gate in Scan ticket"}</span></p>;
}
