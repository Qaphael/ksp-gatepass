"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CameraOff, Flashlight } from "lucide-react";
import { Button } from "@/components/ui/button";

type CameraState = "idle" | "starting" | "active" | "denied" | "error";
type Controls = { stop: () => void; switchTorch?: (onOff: boolean) => Promise<void> };

/** Camera controls shared by gate check-in and seller scan-to-sell. */
export function QrCamera({
  disabled,
  paused = false,
  onScan,
  label = "Ticket QR camera view",
  theme = "light",
}: {
  disabled: boolean;
  paused?: boolean;
  onScan: (value: string) => void;
  label?: string;
  theme?: "light" | "dark";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<Controls | null>(null);
  const onScanRef = useRef(onScan);
  const lastScanRef = useRef({ value: "", at: 0 });
  const [camera, setCamera] = useState<CameraState>("idle");
  const [requested, setRequested] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const isDark = theme === "dark";
  const frameClass = isDark ? "bg-brand-900/90 text-white" : "bg-card text-foreground";
  const mutedClass = isDark ? "text-white/80" : "text-muted-foreground";

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || disabled || paused || controlsRef.current || camera === "starting") return;
    setCamera("starting");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (decoded) => {
        if (!decoded || disabled || paused) return;
        const value = decoded.getText();
        const now = Date.now();
        if (lastScanRef.current.value === value && now - lastScanRef.current.at < 1400) return;
        lastScanRef.current = { value, at: now };
        onScanRef.current(value);
      });
      controlsRef.current = controls;
      setTorchSupported(Boolean(controls.switchTorch));
      setCamera("active");
    } catch (error) {
      setCamera(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "error");
    }
  }, [camera, disabled, paused]);

  useEffect(() => {
    if (disabled || paused) {
      void controlsRef.current?.switchTorch?.(false);
      controlsRef.current?.stop();
      controlsRef.current = null;
      return;
    }
    if (requested && !controlsRef.current && camera !== "starting" && camera !== "denied" && camera !== "error") void startCamera();
  }, [camera, disabled, paused, requested, startCamera]);

  useEffect(() => () => { controlsRef.current?.stop(); }, []);

  const stopCamera = () => {
    setRequested(false);
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCamera("idle");
    setTorchOn(false);
  };

  const statusTitle = camera === "denied" ? "Camera access is blocked" : camera === "error" ? "Camera unavailable" : paused ? "Scanner paused" : "Camera ready when you are";
  const statusMessage = camera === "denied"
    ? "Allow camera access in your browser’s site settings, then return here and tap Start camera."
    : camera === "error"
      ? "Check browser camera permissions and open this page over HTTPS."
      : paused
        ? "Finish the current lookup to scan again."
        : "Use a secure HTTPS connection and allow camera access when prompted.";

  const displayCamera = disabled || paused ? "idle" : camera;
  const displayTorchOn = displayCamera === "active" && torchOn;
  return <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-black text-white" aria-label="QR scanner">
    <div className="relative flex min-h-[min(42dvh,24rem)] flex-1 items-center justify-center bg-black">
      <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline aria-label={label} />
      {displayCamera !== "active" && <div className={`relative z-10 mx-5 max-w-md rounded-2xl border border-current/15 p-5 text-center shadow-xl backdrop-blur-sm ${frameClass}`}>
        {camera === "denied" || camera === "error" ? <AlertCircle className="mx-auto size-10 text-warning-foreground" aria-hidden="true" /> : <Camera className="mx-auto size-10 opacity-75" aria-hidden="true" />}
        <p className="mt-3 text-lg font-bold">{statusTitle}</p><p className={`mt-2 text-base leading-relaxed ${mutedClass}`}>{disabled ? "Connect to the server to scan tickets." : statusMessage}</p>
      </div>}
      {displayCamera === "active" && <div className="pointer-events-none relative z-10 aspect-square w-[min(72vw,20rem)] rounded-3xl border-4 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" aria-hidden="true" />}
    </div>
    <div className="flex flex-wrap gap-3 p-3 sm:p-4">
      {displayCamera === "active" ? <Button type="button" size="xl" onClick={stopCamera} className="min-w-40 flex-1 bg-white text-brand-900 hover:bg-white/90"><CameraOff aria-hidden="true" />Stop camera</Button> : <Button type="button" size="xl" onClick={() => { setRequested(true); void startCamera(); }} disabled={disabled || paused || camera === "starting"} className="min-w-40 flex-1"> <Camera aria-hidden="true" />{camera === "starting" ? "Starting camera…" : "Start camera"}</Button>}
      {torchSupported && <Button type="button" size="xl" variant="outline" onClick={() => { const next = !displayTorchOn; void controlsRef.current?.switchTorch?.(next); setTorchOn(next); }} disabled={displayCamera !== "active"} className="border-white/30 bg-white/10 text-white hover:bg-white/20"><Flashlight aria-hidden="true" />{displayTorchOn ? "Light on" : "Flashlight"}</Button>}
    </div>
  </section>;
}
