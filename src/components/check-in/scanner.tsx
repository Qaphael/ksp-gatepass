"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type Result = { code: string; eligible?: boolean; admitted?: boolean; created?: boolean; message: string; ticket?: { serial: string; ticketTypeName: string; eventName: string }; checkedInAt?: string; gate?: string };
type Props = { eventId: string; eventName: string; mode?: "camera" | "manual" };

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback); window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
}

async function post<T>(url: string, body: unknown, key?: string): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "The server could not complete this request.");
  return data as T;
}

export function CheckInScanner({ eventId, eventName, mode = "camera" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<{ stop: () => void; switchTorch?: (onOff: boolean) => Promise<void> } | null>(null);
  const tokenRef = useRef<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const [gate, setGate] = useState("");
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState("idle");
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [canRetry, setCanRetry] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [recent, setRecent] = useState<Array<{ serial: string; time: string }>>([]);

  useEffect(() => {
    return () => { readerRef.current?.stop(); };
  }, []);

  const confirm = useCallback(async (method: "QR" | "MANUAL", value: string) => {
    const key = keyRef.current ?? crypto.randomUUID(); keyRef.current = key;
    setBusy(true);
    try {
      const payload = method === "QR" ? { eventId, method, token: value, gate } : { eventId, method, serial: value, gate };
      const response = await post<Result>("/api/v1/check-in/confirm", payload, key);
      setResult(response);
      if (response.admitted) { tokenRef.current = null; keyRef.current = null; setCanRetry(false); setRecent((items) => [{ serial: response.ticket?.serial ?? value, time: response.checkedInAt ?? new Date().toISOString() }, ...items].slice(0, 5)); if (method === "MANUAL") setSerial(""); }
    } catch (error) { setCanRetry(method === "QR"); setResult({ code: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Confirmation failed. Retry when connected." }); }
    finally { setBusy(false); busyRef.current = false; }
  }, [eventId, gate]);

  const handleQr = useCallback(async (token: string) => {
    if (busyRef.current) return;
    busyRef.current = true; tokenRef.current = token; keyRef.current = crypto.randomUUID(); readerRef.current?.stop(); setCamera("paused"); setBusy(true);
    try {
      const verified = await post<Result>("/api/v1/check-in/verify-qr", { eventId, token, gate });
      if (verified.eligible) await confirm("QR", token);
      else { tokenRef.current = null; keyRef.current = null; setCanRetry(false); setResult(verified); setBusy(false); busyRef.current = false; }
    } catch (error) { setCanRetry(true); setResult({ code: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Verification failed. Retry when connected." }); setBusy(false); busyRef.current = false; }
  }, [eventId, gate, confirm]);

  const startCamera = async () => {
    if (!videoRef.current || !online) return;
    setCamera("starting"); setResult(null);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (decoded) => { if (decoded) void handleQr(decoded.getText()); });
      readerRef.current = controls; setTorchSupported(Boolean(controls.switchTorch)); setCamera("active");
    } catch (error) { setCamera(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "error"); }
  };

  const verifySerial = async (event: React.FormEvent) => {
    event.preventDefault(); if (!online || busy) return;
    keyRef.current = crypto.randomUUID(); setBusy(true); setResult(null);
    try {
      const checked = await post<Result>("/api/v1/check-in/verify-serial", { eventId, serial, gate });
      setResult(checked);
    } catch (error) { setResult({ code: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Verification failed." }); }
    finally { setBusy(false); }
  };

  return <section className="flex max-w-xl flex-col gap-4 rounded-lg border border-border p-4">
    <div><h2 className="font-semibold">{mode === "manual" ? "Manual ticket lookup" : "Scan ticket QR"}</h2><p className="text-sm text-muted-foreground">{eventName}</p></div>
    <label className="grid gap-1 text-sm">Gate<input className="rounded-md border border-input bg-background px-3 py-2" value={gate} onChange={(e) => setGate(e.target.value)} placeholder="Enter gate name" required /></label>
    {!online && <div role="alert" className="rounded-md border border-amber-500 bg-amber-500/10 p-3 font-semibold text-amber-800">OFFLINE — CHECK-IN UNAVAILABLE</div>}
    {mode === "camera" ? <><video ref={videoRef} className="aspect-video w-full rounded-md bg-black object-cover" muted playsInline /><div className="flex gap-2"><Button type="button" onClick={() => void startCamera()} disabled={!online || camera === "active" || camera === "starting"}>Start camera</Button><Button type="button" variant="outline" onClick={() => { readerRef.current?.stop(); setCamera("idle"); }} disabled={camera !== "active"}>Stop</Button>{torchSupported && <Button type="button" variant="outline" disabled={camera !== "active"} onClick={() => { const next = !torchOn; void readerRef.current?.switchTorch?.(next); setTorchOn(next); }}>{torchOn ? "Turn flashlight off" : "Turn flashlight on"}</Button>}</div><p className="text-sm text-muted-foreground">{camera === "denied" ? "Camera permission was denied. Allow camera access in browser settings." : camera === "error" ? "Camera unavailable. Check permissions and use a secure HTTPS connection." : camera === "active" ? "Camera ready. Hold the QR code in view." : camera === "paused" ? "Code captured. Camera paused while the server checks this ticket." : "Camera access requires permission and HTTPS."}</p></> : <form onSubmit={verifySerial} className="flex gap-2"><input autoComplete="off" className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Ticket serial" required /><Button disabled={!online || busy}>Verify</Button></form>}
    {result && <div role="status" className={`rounded-md border p-3 ${result.admitted ? "border-green-600 bg-green-600/10" : "border-border bg-muted/40"}`}><p className="font-semibold">{result.message}</p>{result.ticket && <p className="mt-1 text-sm">{result.ticket.serial} · {result.ticket.ticketTypeName}</p>}{result.eligible && !result.admitted && mode === "manual" && <Button className="mt-3" disabled={!online || busy} onClick={() => void confirm("MANUAL", serial)}>Confirm admission</Button>}{result.code === "NETWORK_ERROR" && mode === "camera" && canRetry && <Button className="mt-3" disabled={!online || busy} onClick={() => tokenRef.current && void confirm("QR", tokenRef.current)}>Retry server check</Button>}</div>}
    {busy && <p className="text-sm text-muted-foreground">Checking with server…</p>}
    {recent.length > 0 && <div className="border-t pt-3"><h3 className="text-sm font-semibold">Recent admissions on this device</h3><ul className="mt-2 space-y-1 text-sm">{recent.map((item, index) => <li key={`${item.serial}-${index}`} className="flex justify-between gap-3"><span>{item.serial}</span><time className="text-muted-foreground">{new Intl.DateTimeFormat("en-UG", { timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(item.time))}</time></li>)}</ul></div>}
  </section>;
}
