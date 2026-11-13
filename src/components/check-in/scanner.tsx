"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallHint } from "@/components/pwa/install-hint";
import { ResultTakeover, type CheckInResult } from "@/components/check-in/result-takeover";
import { GATE_EVENT, incrementSessionAdmissionCount, readGate, readSessionAdmissionCount, saveGate, SESSION_COUNT_EVENT, subscribeStorageEvents } from "@/components/check-in/session-storage";
import { QrCamera } from "@/components/scanner/qr-camera";
import { useServerHeartbeat } from "@/hooks/use-server-heartbeat";

type Props = { eventId: string; eventName: string; events?: Array<{ id: string; name: string }>; mode?: "camera" | "manual"; showInstallHint?: boolean };

async function post<T>(url: string, body: unknown, key?: string): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "The server could not complete this request.");
  return data as T;
}

export function CheckInScanner({ eventId, eventName, events = [], mode = "camera", showInstallHint = false }: Props) {
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
  const { serverOnline, serverOnlineRef } = useServerHeartbeat();
  const [canRetry, setCanRetry] = useState(false);

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
  }, [eventId, gate, rememberAdmission, serverOnlineRef]);

  const handleQr = useCallback(async (token: string) => {
    if (busyRef.current || !serverOnlineRef.current || !gate.trim()) return;
    busyRef.current = true; tokenRef.current = token; keyRef.current = crypto.randomUUID();
    setBusy(true);
    try {
      const verified = await post<CheckInResult>("/api/v1/check-in/verify-qr", { eventId, token, gate });
      if (verified.eligible) { busyRef.current = false; setBusy(false); await confirm("QR", token); }
      else { tokenRef.current = null; keyRef.current = null; setCanRetry(false); setResult(verified); setBusy(false); busyRef.current = false; }
    } catch (error) {
      setCanRetry(true); setResult({ code: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Verification failed. Check the server connection and retry." }); setBusy(false); busyRef.current = false;
    }
  }, [eventId, gate, confirm, serverOnlineRef]);

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
    const timer = window.setTimeout(() => { setResult(null); }, 4000);
    return () => window.clearTimeout(timer);
  }, [result]);

  const dismissResult = () => { setResult(null); setCanRetry(false); keyRef.current = null; };
  const updateGate = (value: string) => saveGate(eventId, value);
  const gateRequired = !gate.trim();

  return <section className="-mx-4 -my-5 flex min-h-[calc(100dvh_-_8rem)] flex-col overflow-hidden bg-background text-foreground sm:-mx-6 lg:my-0 lg:min-h-[calc(100dvh_-_8rem)]">
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6">
      <div className="min-w-0"><p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{mode === "manual" ? "Manual check-in" : "Gate scanner"}</p><p className="truncate text-base font-semibold">{eventName}</p></div>
      <div className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${serverOnline ? "border-success/50 bg-success text-success-foreground" : "border-warning/60 bg-warning text-warning-foreground"}`} role="status" aria-label={serverOnline ? "Server connected" : "Server connection unavailable"}>
        {serverOnline ? <Wifi className="size-4" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}{serverOnline ? "Connected" : "Connecting…"}
      </div>
    </header>
    {mode === "camera" && showInstallHint ? <InstallHint role="verifier" /> : null}
    {!serverOnline && <div role="alert" className="sticky top-0 z-20 flex min-h-12 items-center justify-center gap-2 bg-warning px-3 text-center text-base font-black text-warning-foreground">OFFLINE — CHECK-IN UNAVAILABLE</div>}
    <div className="flex flex-wrap items-end gap-3 border-b border-border bg-card/70 px-4 py-3 sm:px-6">
      {events.length > 1 && <form className="grid min-w-0 flex-1 gap-1 text-base font-semibold" key={eventId}><label htmlFor="scan-event">Event</label><div className="flex gap-2"><select id="scan-event" name="eventId" defaultValue={eventId} className="min-h-12 min-w-0 flex-1 rounded-control border border-input bg-card px-3 text-base text-foreground">{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button type="submit" size="lg" variant="outline">Open</Button></div></form>}
      <label className="grid min-w-0 flex-1 gap-1 text-base font-semibold">Gate
        <input aria-label="Gate name" className="min-h-12 w-full rounded-control border border-input bg-card px-4 text-base font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" value={gate} onChange={(e) => updateGate(e.target.value)} placeholder="Enter gate name" />
      </label>
      <div className="flex min-h-12 items-center rounded-control border border-border bg-card px-4 py-2 text-sm shadow-sm"><span className="text-muted-foreground">This session</span><strong className="ml-2 text-base tabular-nums">{sessionCount}</strong></div>
    </div>

    {mode === "camera" ? <>
      <QrCamera disabled={!serverOnline || gateRequired} paused={Boolean(result) || busy} onScan={(value) => void handleQr(value)} label="Ticket QR camera view" theme="light" />
      {gateRequired && <p className="px-4 pb-3 text-base font-medium text-warning-foreground sm:px-6">Enter the gate name before scanning.</p>}
    </> : <div className="flex flex-1 flex-col justify-center px-4 py-6 sm:px-6">
      <form onSubmit={verifySerial} className="mx-auto w-full max-w-2xl rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-6">
        <label className="grid gap-2 text-base font-semibold" htmlFor="ticket-serial">Ticket serial</label>
        <div className="mt-2 flex gap-2">
          <input id="ticket-serial" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" className="min-h-14 min-w-0 flex-1 rounded-control border border-input bg-background px-4 font-mono text-xl font-bold uppercase tracking-wider text-foreground placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal" value={serial} onChange={(e) => setSerial(e.target.value.toUpperCase())} placeholder="KSP-00001" />
          <Button type="button" size="xl" variant="outline" onClick={() => { setSerial(""); setResult(null); }} disabled={!serial}>Clear</Button>
        </div>
        <Button size="xl" className="mt-4 w-full" disabled={!serverOnline || gateRequired || busy || !serial.trim()}>{busy ? "Checking…" : "Verify serial"}</Button>
      </form>
      {gateRequired && <p className="mx-auto mt-3 w-full max-w-2xl text-base font-medium text-warning-foreground">Enter the gate name before verifying.</p>}
    </div>}
    <footer className="flex items-center justify-between gap-3 border-t border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground sm:px-6"><span className="truncate">{serverOnline ? "Connected to admission service" : "Waiting for server connection"}</span><span className="shrink-0 font-medium">{busy ? "Checking…" : mode === "camera" ? "Ready to scan" : "Gate staff"}</span></footer>

    {result && <ResultTakeover result={result} onDismiss={dismissResult} canConfirm={Boolean(result.eligible && mode === "manual")} onConfirm={() => void confirm("MANUAL", serial.trim().toUpperCase())} busy={busy} />}
    {result?.code === "NETWORK_ERROR" && mode === "camera" && canRetry && serverOnline && <div className="fixed inset-x-4 bottom-24 z-[80] mx-auto max-w-xl"><Button size="xl" className="w-full" onClick={() => tokenRef.current && void confirm("QR", tokenRef.current)} disabled={busy}>Retry server check</Button></div>}
  </section>;
}
