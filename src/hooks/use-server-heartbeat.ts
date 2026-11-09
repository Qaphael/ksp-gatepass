"use client";

import { useEffect, useRef, useState } from "react";

/** Poll the authenticated server every eight seconds; never infer service health from navigator.onLine. */
export function useServerHeartbeat() {
  const [serverOnline, setServerOnline] = useState(false);
  const serverOnlineRef = useRef(false);

  useEffect(() => {
    let live = true;
    const beat = async () => {
      try {
        const response = await fetch("/api/v1/auth/me", { method: "GET", cache: "no-store", headers: { accept: "application/json" } });
        if (!live) return;
        serverOnlineRef.current = response.ok;
        setServerOnline(response.ok);
      } catch {
        if (!live) return;
        serverOnlineRef.current = false;
        setServerOnline(false);
      }
    };
    void beat();
    const interval = window.setInterval(() => void beat(), 8000);
    return () => { live = false; window.clearInterval(interval); };
  }, []);

  return { serverOnline, serverOnlineRef };
}
