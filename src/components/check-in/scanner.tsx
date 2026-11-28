"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ScanLineIcon, TicketIcon, WifiIcon, WifiOffIcon, XIcon } from "lucide-react";
import { ResultTakeover, type CheckInResult } from "@/components/check-in/result-takeover";
import {
  GATE_EVENT,
  incrementSessionAdmissionCount,
  readGate,
  readSessionAdmissionCount,
  saveGate,
  SESSION_COUNT_EVENT,
  subscribeStorageEvents,
} from "@/components/check-in/session-storage";
import { InstallHint } from "@/components/pwa/install-hint";
import { Alert, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { QrCamera } from "@/components/scanner/qr-camera";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { useServerHeartbeat } from "@/hooks/use-server-heartbeat";

type Props = {
  eventId: string;
  eventName: string;
  events?: Array<{ id: string; name: string }>;
  mode?: "camera" | "manual";
  showInstallHint?: boolean;
};

async function post<T>(url: string, body: unknown, key?: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? "The server could not complete this request.");
  }
  return data as T;
}

export function CheckInScanner({
  eventId,
  eventName,
  events = [],
  mode = "camera",
  showInstallHint = false,
}: Props) {
  const tokenRef = useRef<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const subscribeGate = useCallback(
    (callback: () => void) => subscribeStorageEvents(callback, GATE_EVENT),
    [],
  );
  const gate = useSyncExternalStore(
    subscribeGate,
    () => readGate(eventId),
    () => "",
  );
  const subscribeCount = useCallback(
    (callback: () => void) => subscribeStorageEvents(callback, SESSION_COUNT_EVENT),
    [],
  );
  const sessionCount = useSyncExternalStore(
    subscribeCount,
    () => readSessionAdmissionCount(eventId),
    () => 0,
  );
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const { serverOnline, serverOnlineRef } = useServerHeartbeat();
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rememberAdmission = useCallback(() => {
    tokenRef.current = null;
    keyRef.current = null;
    setCanRetry(false);
    incrementSessionAdmissionCount(eventId);
    if (mode === "manual") setSerial("");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(120);
  }, [eventId, mode]);

  const confirm = useCallback(
    async (method: "QR" | "MANUAL", value: string) => {
      if (!serverOnlineRef.current || busyRef.current) return;
      const key = keyRef.current ?? crypto.randomUUID();
      keyRef.current = key;
      busyRef.current = true;
      setBusy(true);
      try {
        const payload =
          method === "QR"
            ? { eventId, method, token: value, gate }
            : { eventId, method, serial: value, gate };
        const response = await post<CheckInResult>("/api/v1/check-in/confirm", payload, key);
        setResult(response);
        if (response.admitted && response.code === "ADMITTED") rememberAdmission();
        else {
          setCanRetry(false);
          keyRef.current = null;
        }
      } catch (error) {
        setCanRetry(method === "QR");
        setResult({
          code: "NETWORK_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Confirmation failed. Check the server connection and retry.",
        });
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [eventId, gate, rememberAdmission, serverOnlineRef],
  );

  const handleQr = useCallback(
    async (token: string) => {
      if (busyRef.current || !serverOnlineRef.current || !gate.trim()) return;
      busyRef.current = true;
      tokenRef.current = token;
      keyRef.current = crypto.randomUUID();
      setBusy(true);
      try {
        const verified = await post<CheckInResult>("/api/v1/check-in/verify-qr", {
          eventId,
          token,
          gate,
        });
        if (verified.eligible) {
          busyRef.current = false;
          setBusy(false);
          await confirm("QR", token);
        } else {
          tokenRef.current = null;
          keyRef.current = null;
          setCanRetry(false);
          setResult(verified);
          setBusy(false);
          busyRef.current = false;
        }
      } catch (error) {
        setCanRetry(true);
        setResult({
          code: "NETWORK_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Verification failed. Check the server connection and retry.",
        });
        setBusy(false);
        busyRef.current = false;
      }
    },
    [eventId, gate, confirm, serverOnlineRef],
  );

  const verifySerial = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!serverOnline || busy || !serial.trim() || !gate.trim()) return;
    keyRef.current = crypto.randomUUID();
    setBusy(true);
    setResult(null);
    try {
      const checked = await post<CheckInResult>("/api/v1/check-in/verify-serial", {
        eventId,
        serial: serial.trim().toUpperCase(),
        gate,
      });
      setResult(checked);
    } catch (error) {
      setResult({
        code: "NETWORK_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Verification failed. Check the server connection.",
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!result?.admitted || result.code !== "ADMITTED") return;
    const timer = window.setTimeout(() => {
      setResult(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [result]);

  const dismissResult = () => {
    setResult(null);
    setCanRetry(false);
    keyRef.current = null;
  };
  const updateGate = (value: string) => saveGate(eventId, value);
  const gateRequired = !gate.trim();

  return (
    <div className="flex flex-col gap-4">
      {!serverOnline ? (
        <Alert variant="warning">
          <WifiOffIcon aria-hidden="true" />
          <AlertTitle>OFFLINE — CHECK-IN UNAVAILABLE</AlertTitle>
        </Alert>
      ) : null}

      {mode === "camera" && showInstallHint ? <InstallHint role="verifier" /> : null}

      <Frame spacing="default">
        <FrameHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {serverOnline ? (
                <WifiIcon className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <WifiOffIcon className="size-4 shrink-0" aria-hidden="true" />
              )}
              <div className="flex flex-col gap-0.5">
                <FrameTitle>{eventName}</FrameTitle>
                <FrameDescription>
                  {mode === "manual" ? "Manual serial verification" : "QR gate scanner"}
                </FrameDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="tabular-nums">
                Session: {sessionCount}
              </Badge>
              <Badge
                variant={serverOnline ? "success-light" : "warning-light"}
                role="status"
                aria-label={serverOnline ? "Server connected" : "Server connection unavailable"}
              >
                {serverOnline ? "Online" : "Connecting…"}
              </Badge>
            </div>
          </div>
        </FrameHeader>

        <FramePanel className="grid gap-4 sm:grid-cols-2">
          {events.length > 1 ? (
            <form className="flex flex-col gap-1.5" key={eventId}>
              <Label htmlFor="scan-event">Event</Label>
              <NativeSelect id="scan-event" name="eventId" defaultValue={eventId} className="w-full">
                {events.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </form>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scan-gate">Gate name</Label>
            <InputGroup>
              <InputGroupAddon>
                <ScanLineIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id="scan-gate"
                aria-label="Gate name"
                value={gate}
                onChange={(e) => updateGate(e.target.value)}
                placeholder="Gate A — Main Entrance"
              />
            </InputGroup>
          </div>
        </FramePanel>
      </Frame>

      {gateRequired ? (
        <Alert variant="warning">
          <AlertTitle>Enter a gate name before scanning or verifying tickets.</AlertTitle>
        </Alert>
      ) : null}

      {mode === "camera" ? (
        <Frame spacing="default">
          <FramePanel className="overflow-hidden p-0">
            <QrCamera
              disabled={!serverOnline || gateRequired}
              paused={Boolean(result) || busy}
              onScan={(value) => void handleQr(value)}
              label="Ticket QR camera view"
              theme="light"
              className="min-h-[340px]"
              viewportClassName="min-h-[340px]"
            />
          </FramePanel>
          <FrameFooter>
            <ScannerFooterLinks
              serverOnline={serverOnline}
              sessionCount={sessionCount}
              now={now}
            />
          </FrameFooter>
        </Frame>
      ) : (
        <Frame spacing="default">
          <FrameHeader>
            <FrameTitle>Verify ticket serial</FrameTitle>
            <FrameDescription>
              Type the serial printed on the pass (for example KSP-00001).
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <form onSubmit={verifySerial} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ticket-serial">Ticket serial</Label>
                <InputGroup>
                  <InputGroupAddon>
                    <TicketIcon aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="ticket-serial"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    className="font-mono uppercase tracking-wider"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value.toUpperCase())}
                    placeholder="KSP-00001"
                  />
                  {serial ? (
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="button"
                        size="icon-xs"
                        aria-label="Clear serial"
                        onClick={() => {
                          setSerial("");
                          setResult(null);
                        }}
                      >
                        <XIcon aria-hidden="true" />
                      </InputGroupButton>
                    </InputGroupAddon>
                  ) : null}
                </InputGroup>
              </div>
              <Button
                type="submit"
                disabled={!serverOnline || gateRequired || busy || !serial.trim()}
                className="w-full sm:w-fit"
              >
                {busy ? <Spinner /> : null}
                {busy ? "Checking…" : "Verify serial"}
              </Button>
            </form>
          </FramePanel>
          <FrameFooter>
            <ScannerFooterLinks
              serverOnline={serverOnline}
              sessionCount={sessionCount}
              now={now}
            />
          </FrameFooter>
        </Frame>
      )}

      {result ? (
        <ResultTakeover
          result={result}
          busy={busy}
          canConfirm={canRetry || Boolean(result.eligible)}
          onConfirm={() => {
            if (mode === "camera" && tokenRef.current) {
              void confirm("QR", tokenRef.current);
            } else if (mode === "manual" && serial.trim()) {
              void confirm("MANUAL", serial.trim().toUpperCase());
            }
          }}
          onDismiss={dismissResult}
        />
      ) : null}
    </div>
  );
}

function ScannerFooterLinks({
  serverOnline,
  sessionCount,
  now,
}: {
  serverOnline: boolean;
  sessionCount: number;
  now: Date | null;
}) {
  return (
    <div className="text-muted-foreground flex w-full flex-wrap items-center justify-between gap-3 text-xs">
      <span className="font-mono tabular-nums">
        {serverOnline ? "Gate dispatch" : "Offline"} · Verified {sessionCount}
      </span>
      <div className="flex items-center gap-4 font-mono">
        <Link href="/check-in/recent" className="hover:text-foreground">
          Attendance
        </Link>
        <Link href="/check-in/attempts" className="hover:text-foreground">
          Attempts
        </Link>
        <span aria-live="off" className="tabular-nums">
          {now
            ? now.toLocaleTimeString("en-GB", {
                timeZone: "Africa/Kampala",
                hour12: false,
              })
            : ""}{" "}
          EAT
        </span>
      </div>
    </div>
  );
}
