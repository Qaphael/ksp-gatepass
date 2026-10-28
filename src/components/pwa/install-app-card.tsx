"use client";

import { useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePwaInstall } from "@/components/pwa/install-provider";

export function InstallAppCard() {
  const { isInstalled, promptAvailable, install } = usePwaInstall();
  const [installing, setInstalling] = useState(false);

  async function installApp() {
    if (!promptAvailable) return;
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Smartphone aria-hidden="true" />Install app</CardTitle>
        <CardDescription>
          Add KSP GatePass to this device for a full-screen launch and quick access on event day.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {isInstalled ? (
          <p role="status" className="text-base font-medium text-success-foreground">KSP GatePass is installed on this device.</p>
        ) : promptAvailable ? (
          <Button className="min-h-12 w-full sm:w-auto" onClick={() => void installApp()} disabled={installing}>
            <Download aria-hidden="true" />{installing ? "Opening install…" : "Install KSP GatePass"}
          </Button>
        ) : (
          <div className="rounded-lg bg-secondary p-3 text-sm leading-relaxed text-secondary-foreground">
            <p><strong>Android / Chrome:</strong> open the browser menu and choose “Install app” or “Add to Home screen”.</p>
            <p className="mt-2"><strong>iPhone / Safari:</strong> tap Share, then “Add to Home Screen”.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
