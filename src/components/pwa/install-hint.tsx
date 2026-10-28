"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/components/pwa/install-provider";

const DISMISSED_KEY = "ksp-pwa-install-hint-dismissed";
const CHANGE_EVENT = "ksp-pwa-install-hint-change";

function subscribeToHint(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function readDismissed() {
  return window.localStorage.getItem(DISMISSED_KEY) === "1";
}

export function InstallHint({ role }: { role: "seller" | "verifier" }) {
  const { isInstalled, promptAvailable, install } = usePwaInstall();
  const dismissed = useSyncExternalStore(subscribeToHint, readDismissed, () => true);
  const [installing, setInstalling] = useState(false);

  if (dismissed || isInstalled) return null;

  async function installApp() {
    if (!promptAvailable) return;
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  }

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <aside className="flex items-center gap-2 border-b border-white/15 bg-brand-900 px-3 py-2 text-white" aria-label="Install app hint">
      <Download className="size-4 shrink-0 text-gold-500" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs leading-snug">
        Install GatePass for quick {role === "verifier" ? "gate scanning" : "ticket sales"} from your home screen.
      </p>
      {promptAvailable ? (
        <Button size="sm" variant="outline" className="min-h-10 shrink-0 border-white/30 bg-white/10 px-3 text-white hover:bg-white/20" onClick={() => void installApp()} disabled={installing}>
          {installing ? "Opening…" : "Install"}
        </Button>
      ) : (
        <span className="shrink-0 text-[11px] text-white/75">Browser menu</span>
      )}
      <Button type="button" size="icon" variant="ghost" className="size-10 shrink-0 text-white hover:bg-white/15 hover:text-white" aria-label="Dismiss install app hint" onClick={dismiss}>
        <X aria-hidden="true" />
      </Button>
    </aside>
  );
}
