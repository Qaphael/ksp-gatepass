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
  viewportClassName = "min-h-[min(42dvh,24rem)]",
  className = "",
}: {
  disabled: boolean;
  paused?: boolean;
  onScan: (value: string) => void;
  label?: string;
  theme?: "light" | "dark";
  viewportClassName?: string;
  className?: string;
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
  const frameClass = isDark ? "bg-background/90 text-foreground" : "bg-card text-foreground";
  const mutedClass = isDark ? "text-foreground/80" : "text-muted-foreground";

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
  return <section className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-card ${className}`} aria-label="QR scanner">
    <div className={`relative flex flex-1 items-center justify-center bg-background text-foreground ${viewportClassName}`}>
      <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline aria-label={label} />
      {displayCamera !== "active" && <div className={`relative z-10 mx-5 max-w-md rounded-2xl border border-current/15 p-5 text-center shadow-xl backdrop-blur-sm ${frameClass}`}>
        {camera === "denied" || camera === "error" ? <AlertCircle className="mx-auto size-10 text-warning" aria-hidden="true" /> : <Camera className="mx-auto size-10 opacity-75" aria-hidden="true" />}
        <p className="mt-3 text-lg font-bold">{statusTitle}</p><p className={`mt-2 text-base leading-relaxed ${mutedClass}`}>{disabled ? "Connect to the server to scan tickets." : statusMessage}</p>
      </div>}
      {displayCamera === "active" && <div className="pointer-events-none relative z-10 aspect-square w-[min(72vw,20rem)]" aria-hidden="true">
        {/* Focus stencil mask */}
        <div className="absolute inset-0 rounded-3xl border-4 border-primary/90 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
        {/* Corner reticles */}
        <div className="absolute -left-0.5 -top-0.5 size-9 rounded-tl-2xl border-l-4 border-t-4 border-primary" />
        <div className="absolute -right-0.5 -top-0.5 size-9 rounded-tr-2xl border-r-4 border-t-4 border-primary" />
        <div className="absolute -bottom-0.5 -left-0.5 size-9 rounded-bl-2xl border-b-4 border-l-4 border-primary" />
        <div className="absolute -bottom-0.5 -right-0.5 size-9 rounded-br-2xl border-b-4 border-r-4 border-primary" />
        {/* Animated scan line */}
        <div className="absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 animate-[scan_1.6s_ease-in-out_infinite] rounded-full bg-primary/80 shadow-[0_0_12px_2px_rgba(94,106,210,0.55)]" />
        {/* Align hint */}
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <span className="rounded-full bg-background/70 px-3 py-1 font-mono text-[11px] tracking-wider text-foreground backdrop-blur-md">ALIGN QR IN BOX</span>
        </div>
      </div>}
    </div>
    <div className="flex flex-wrap gap-3 p-3 sm:p-4">
      {displayCamera === "active" ? <Button type="button" size="lg" variant="outline" onClick={stopCamera} className="min-w-40 flex-1"><CameraOff aria-hidden="true" />Stop camera</Button> : <Button type="button" size="lg" onClick={() => { setRequested(true); void startCamera(); }} disabled={disabled || paused || camera === "starting"} className="min-w-40 flex-1"> <Camera aria-hidden="true" />{camera === "starting" ? "Starting camera…" : "Start camera"}</Button>}
      {torchSupported && <Button type="button" size="lg" variant="outline" onClick={() => { const next = !displayTorchOn; void controlsRef.current?.switchTorch?.(next); setTorchOn(next); }} disabled={displayCamera !== "active"}><Flashlight aria-hidden="true" />{displayTorchOn ? "Light on" : "Flashlight"}</Button>}
    </div>
  </section>;
}
