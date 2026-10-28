"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallContextValue {
  isInstalled: boolean;
  promptAvailable: boolean;
  install: () => Promise<boolean>;
}

const InstallContext = createContext<InstallContextValue | null>(null);

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncInstalled = () => {
      const appleStandalone = "standalone" in navigator && Boolean(navigator.standalone);
      setIsInstalled(displayMode.matches || appleStandalone);
    };
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const clearPrompt = () => {
      setPromptEvent(null);
      setIsInstalled(true);
    };

    syncInstalled();
    displayMode.addEventListener("change", syncInstalled);
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", clearPrompt);
    return () => {
      displayMode.removeEventListener("change", syncInstalled);
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("appinstalled", clearPrompt);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === "accepted") setIsInstalled(true);
    return choice.outcome === "accepted";
  }, [promptEvent]);

  const value = useMemo(
    () => ({ isInstalled, promptAvailable: Boolean(promptEvent), install }),
    [install, isInstalled, promptEvent],
  );

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

export function usePwaInstall() {
  const context = useContext(InstallContext);
  if (!context) throw new Error("usePwaInstall must be used inside PwaInstallProvider.");
  return context;
}
