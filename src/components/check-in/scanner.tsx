"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, Camera, CameraOff, Flashlight, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResultTakeover, type CheckInResult } from "@/components/check-in/result-takeover";
import { GATE_EVENT, incrementSessionAdmissionCount, readGate, readSessionAdmissionCount, saveGate, SESSION_COUNT_EVENT, subscribeStorageEvents } from "@/components/check-in/session-storage";

type Props = { eventId: string; eventName: string; events?: Array<{ id: string; name: string }>; mode?: "camera" | "manual" };
type CameraState = "idle" | "starting" | "active" | "denied" | "error" | "paused";

async function post<T>(url: string, body: unknown, key?: string): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "The server could not complete this request.");
  return data as T;
}

export function CheckInScanner({ eventId, eventName, events = [], mode = "camera" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<{ stop: () => void; switchTorch?: (onOff: boolean) => Promise<void> } | null>(null);
  const tokenRef = useRef<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const subscribeGate = useCallback((callback: () => void) => subscribeStorageEvents(callback, GATE_EVENT), []);
  const gate = useSyncExternalStore(subscribeGate, () => readGate(eventId), () => "");
  const subscribeCount = useCallback((callback: () => void) => subscribeStorageEvents(callback, SESSION_COUNT_EVENT), []);
  const sessionCount = useSyncExternalStore(subscribeCount, () => readSessionAdmissionCount(eventId), () => 0);
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<CameraState>("idle");
  const [serverOnline, setServerOnline] = useState(false);
  const serverOnlineRef = useRef(false);
  const [canRetry, setCanRetry] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  useEffect(() => {
    let live = true;
    const beat = async () => {
      try {
        const response = await fetch("/api/v1/auth/me", { method: "GET", cache: "no-store", headers: { accept: "application/json" } });
        if (!live) return;
        const healthy = response.ok;
        serverOnlineRef.current = healthy;
        setServerOnline(healthy);
        if (!healthy) { readerRef.current?.stop(); readerRef.current = null; setCamera((current) => current === "active" ? "paused" : current); }
      } catch {
        if (!live) return;
        serverOnlineRef.current = false;
        setServerOnline(false);
        readerRef.current?.stop(); readerRef.current = null;
        setCamera((current) => current === "active" ? "paused" : current);
      }
    };
    void beat();
    const interval = window.setInterval(() => void beat(), 8000);
    return () => { live = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => () => { readerRef.current?.stop(); }, []);

  const rememberAdmission = useCallback(() => {
    tokenRef.current = null;
    keyRef.current = null;
    setCanRetry(false);
    incrementSessionAdmissionCount(eventId);
    if (mode === "manual") setSerial("");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(120);
  }, [eventId, mode]);

  const confirm = useCallback(async (method: "QR" | "MANUAL", value: string) => {
    if (!serverOnlineRef.current || busyRef.current) return;
    const key = keyRef.current ?? crypto.randomUUID(); keyRef.current = key;
    busyRef.current = true; setBusy(true);
    try {
      const payload = method === "QR" ? { eventId, method, token: value, gate } : { eventId, method, serial: value, gate };
      const response = await post<CheckInResult>("/api/v1/check-in/confirm", payload, key);
      setResult(response);
      if (response.admitted && response.code === "ADMITTED") rememberAdmission();
      else { setCanRetry(false); keyRef.current = null; }
    } catch (error) {
      setCanRetry(method === "QR");
      setResult({ code: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Confirmation failed. Check the server connection and retry." });
    } finally { setBusy(false); busyRef.current = false; }
  }, [eventId, gate, rememberAdmission]);

  const handleQr = useCallback(async (token: string) => {
    if (busyRef.current || !serverOnlineRef.current || !gate.trim()) return;
    busyRef.current = true; tokenRef.current = token; keyRef.current = crypto.randomUUID();
    readerRef.current?.stop(); setCamera("paused"); setBusy(true);
    try {
      const verified = await post<CheckInResult>("/api/v1/check-in/verify-qr", { eventId, token, gate });
      if (verified.eligible) { busyRef.current = false; setBusy(false); await confirm("QR", token); }
      else { tokenRef.current = null; keyRef.current = null; setCanRetry(false); setResult(verified); setBusy(false); busyRef.current = false; }
    } catch (error) {
      setCanRetry(true); setResult({ code: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Verification failed. Check the server connection and retry." }); setBusy(false); busyRef.current = false;
    }
  }, [eventId, gate, confirm]);

  const startCamera = async () => {
    if (!videoRef.current || !serverOnline || !gate.trim() || camera === "active" || camera === "starting") return;
    setCamera("starting"); setResult(null);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (decoded) => { if (decoded) void handleQr(decoded.getText()); });
      readerRef.current = controls; setTorchSupported(Boolean(controls.switchTorch)); setCamera("active");
    } catch (error) { setCamera(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "error"); }
  };

  const stopCamera = () => { readerRef.current?.stop(); readerRef.current = null; setCamera("idle"); setTorchOn(false); };

  const verifySerial = async (event: React.FormEvent) => {
    event.preventDefault(); if (!serverOnline || busy || !serial.trim() || !gate.trim()) return;
    keyRef.current = crypto.randomUUID(); setBusy(true); setResult(null);
    try {
      const checked = await post<CheckInResult>("/api/v1/check-in/verify-serial", { eventId, serial: serial.trim().toUpperCase(), gate });
      setResult(checked);
    } catch (error) { setResult({ code: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Verification failed. Check the server connection." }); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!result?.admitted || result.code !== "ADMITTED") return;
    const timer = window.setTimeout(() => { setResult(null); setCamera("idle"); }, 4000);
    return () => window.clearTimeout(timer);
  }, [result]);

  const dismissResult = () => { setResult(null); setCanRetry(false); keyRef.current = null; setCamera("idle"); };
  const updateGate = (value: string) => saveGate(eventId, value);
  const gateRequired = !gate.trim();

  return <section className="-mx-4 -my-5 flex min-h-[calc(100dvh_-_8rem)] flex-col overflow-hidden bg-brand-900 text-white sm:-mx-6 lg:my-0 lg:min-h-[calc(100dvh_-_8rem)]">
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/15 px-4 py-2 sm:px-6">
      <div className="min-w-0"><p className="truncate text-xs font-medium uppercase tracking-[0.16em] text-white/70">{mode === "manual" ? "Manual check-in" : "Gate scanner"}</p><p className="truncate text-base font-semibold">{eventName}</p></div>
      <div className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${serverOnline ? "border-emerald-300/50 bg-emerald-300/10 text-emerald-100" : "border-amber-200/50 bg-amber-200/10 text-amber-100"}`} role="status" aria-label={serverOnline ? "Server connected" : "Server connection unavailable"}>
        {serverOnline ? <Wifi className="size-4" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}{serverOnline ? "Connected" : "Connecting…"}
      </div>
    </header>
    {!serverOnline && <div role="alert" className="sticky top-0 z-20 flex min-h-12 items-center justify-center gap-2 bg-amber-300 px-3 text-center text-base font-black text-amber-950">OFFLINE — CHECK-IN UNAVAILABLE</div>}
    <div className="flex flex-wrap items-end gap-3 border-b border-white/15 px-4 py-3 sm:px-6">
      {events.length > 1 && <form className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-white/90" key={eventId}><label htmlFor="scan-event">Event</label><div className="flex gap-2"><select id="scan-event" name="eventId" defaultValue={eventId} className="min-h-12 min-w-0 flex-1 rounded-lg border border-white/30 bg-white px-3 text-base text-ink">{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button type="submit" size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Open</Button></div></form>}
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-white/90">Gate
        <input aria-label="Gate name" className="min-h-12 w-full rounded-lg border border-white/30 bg-white px-3 text-base font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500" value={gate} onChange={(e) => updateGate(e.target.value)} placeholder="Enter gate name" />
      </label>
      <div className="min-h-12 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm"><span className="text-white/70">This session</span><strong className="ml-2 tabular-nums">{sessionCount}</strong></div>
    </div>

    {mode === "camera" ? <>
      <div className="relative flex min-h-[min(52dvh,30rem)] flex-1 items-center justify-center bg-black">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline aria-label="Ticket QR camera view" />
        {camera !== "active" && <div className="relative z-10 mx-6 max-w-md rounded-2xl border border-white/20 bg-brand-900/90 p-6 text-center shadow-xl backdrop-blur-sm">
          {camera === "denied" ? <AlertCircle className="mx-auto size-12 text-amber-300" aria-hidden="true" /> : <Camera className="mx-auto size-12 text-white/80" aria-hidden="true" />}
          <p className="mt-3 text-xl font-bold">{camera === "denied" ? "Camera access is blocked" : camera === "error" ? "Camera unavailable" : camera === "paused" ? "Scanner paused" : "Camera ready when you are"}</p>
          <p className="mt-2 text-base leading-relaxed text-white/80">{camera === "denied" ? "Allow camera access in your browser’s site settings, then return here and tap Start camera." : camera === "error" ? "Check browser camera permissions and open this page over HTTPS." : camera === "paused" ? "Dismiss the ticket result to scan again." : "Use a secure HTTPS connection and allow camera access when prompted."}</p>
        </div>}
        {camera === "active" && <div className="pointer-events-none relative z-10 aspect-square w-[min(72vw,20rem)] rounded-3xl border-4 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" aria-hidden="true" />}
      </div>
      <div className="flex flex-wrap gap-3 px-4 py-4 sm:px-6">
        {camera === "active" ? <Button type="button" size="xl" onClick={stopCamera} className="min-w-40 flex-1 bg-white text-brand-900 hover:bg-white/90"><CameraOff aria-hidden="true" />Stop camera</Button> : <Button type="button" size="xl" onClick={() => void startCamera()} disabled={!serverOnline || gateRequired || camera === "starting"} className="min-w-40 flex-1 bg-success text-success-foreground hover:bg-success/90"><Camera aria-hidden="true" />{camera === "starting" ? "Starting camera…" : "Start camera"}</Button>}
        {torchSupported && <Button type="button" size="xl" variant="outline" onClick={() => { const next = !torchOn; void readerRef.current?.switchTorch?.(next); setTorchOn(next); }} disabled={camera !== "active"} className="border-white/30 bg-white/10 text-white hover:bg-white/20"><Flashlight aria-hidden="true" />{torchOn ? "Light on" : "Flashlight"}</Button>}
      </div>
      {gateRequired && <p className="px-4 pb-3 text-base text-amber-100 sm:px-6">Enter the gate name before scanning.</p>}
    </> : <div className="flex flex-1 flex-col justify-center px-4 py-6 sm:px-6">
      <form onSubmit={verifySerial} className="mx-auto w-full max-w-2xl rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-6">
        <label className="grid gap-2 text-base font-semibold" htmlFor="ticket-serial">Ticket serial</label>
        <div className="mt-2 flex gap-2">
          <input id="ticket-serial" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" className="min-h-14 min-w-0 flex-1 rounded-xl border border-white/30 bg-white px-4 font-mono text-xl font-bold uppercase tracking-wider text-ink placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal" value={serial} onChange={(e) => setSerial(e.target.value.toUpperCase())} placeholder="KSP-00001" />
          <Button type="button" size="xl" variant="outline" onClick={() => { setSerial(""); setResult(null); }} disabled={!serial} className="border-white/30 bg-white/10 text-white hover:bg-white/20">Clear</Button>
        </div>
        <Button size="xl" className="mt-4 w-full" disabled={!serverOnline || gateRequired || busy || !serial.trim()}>{busy ? "Checking…" : "Verify serial"}</Button>
      </form>
      {gateRequired && <p className="mx-auto mt-3 w-full max-w-2xl text-base text-amber-100">Enter the gate name before verifying.</p>}
    </div>}
    <footer className="flex items-center justify-between gap-3 border-t border-white/15 px-4 py-3 text-sm text-white/75 sm:px-6"><span className="truncate">{serverOnline ? "Connected to admission service" : "Waiting for server connection"}</span><span className="shrink-0">{busy ? "Checking…" : camera === "active" ? "Ready to scan" : "Gate staff"}</span></footer>

    {result && <ResultTakeover result={result} onDismiss={dismissResult} canConfirm={Boolean(result.eligible && mode === "manual")} onConfirm={() => void confirm("MANUAL", serial.trim().toUpperCase())} busy={busy} />}
    {result?.code === "NETWORK_ERROR" && mode === "camera" && canRetry && serverOnline && <div className="fixed inset-x-4 bottom-24 z-[80] mx-auto max-w-xl"><Button size="xl" className="w-full" onClick={() => tokenRef.current && void confirm("QR", tokenRef.current)} disabled={busy}>Retry server check</Button></div>}
  </section>;
}
