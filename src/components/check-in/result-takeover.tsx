"use client";

import { AlertTriangle, Check, CircleSlash, Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CheckInResult = {
  code: string;
  eligible?: boolean;
  admitted?: boolean;
  created?: boolean;
  message: string;
  ticket?: { serial: string; ticketTypeName: string; eventName: string };
  checkedInAt?: string;
  gate?: string;
  originalCheckIn?: { checkedInAt: string; gate: string };
};

type Tone = "success" | "danger" | "warning";
type ResultPresentation = { tone: Tone; label: string; icon: "check" | "invalid" | "warning"; reason: string };

const redCodes = new Set(["INVALID_QR", "UNKNOWN_SERIAL", "OTHER_EVENT", "TICKET_CANCELLED", "TICKET_REVOKED", "ALREADY_USED", "TICKET_NOT_SOLD"]);
const amberCodes = new Set(["NOT_PAID", "NOT_YET_VALID", "EXPIRED", "ADMISSION_CLOSED", "CATEGORY_NOT_ADMISSIBLE", "ELIGIBLE"]);

export function getResultPresentation(result: CheckInResult): ResultPresentation {
  if (result.admitted && result.code === "ADMITTED") {
    return { tone: "success", label: "VALID — ADMITTED", icon: "check", reason: "Admission confirmed by the server." };
  }
  if (amberCodes.has(result.code)) return { tone: "warning", label: result.code === "ELIGIBLE" ? "READY TO CONFIRM" : "CHECK REQUIRED", icon: "warning", reason: result.message };
  if (redCodes.has(result.code) || result.code === "NETWORK_ERROR") {
    return { tone: "danger", label: result.code === "NETWORK_ERROR" ? "NETWORK ERROR" : "TICKET REJECTED", icon: "invalid", reason: result.message };
  }
  return { tone: "danger", label: "TICKET REJECTED", icon: "invalid", reason: result.message };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(value));
}

export function ResultTakeover({ result, onDismiss, onConfirm, busy, canConfirm }: {
  result: CheckInResult;
  onDismiss: () => void;
  onConfirm?: () => void;
  busy?: boolean;
  canConfirm?: boolean;
}) {
  const presentation = getResultPresentation(result);
  const admitted = presentation.tone === "success";
  const colors = admitted
    ? "bg-success text-success-foreground"
    : presentation.tone === "warning" ? "bg-warning text-warning-foreground" : "bg-danger text-danger-foreground";
  const Icon = presentation.icon === "check" ? Check : presentation.icon === "warning" ? AlertTriangle : CircleSlash;
  const original = result.originalCheckIn;

  return <div role="alert" aria-live="assertive" aria-atomic="true" className={`fixed inset-0 z-[70] flex min-h-dvh flex-col items-center justify-center overflow-y-auto px-5 py-8 text-center ${colors}`}>
    {!admitted && <button type="button" aria-label="Dismiss result" onClick={onDismiss} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex size-12 items-center justify-center rounded-full border border-current/30" ><X aria-hidden="true" /></button>}
    <Icon aria-hidden="true" className="mb-5 size-24 stroke-[2.5] sm:size-32" />
    <p className="text-3xl font-black tracking-wide sm:text-5xl">{presentation.label}</p>
    <p className="mt-4 max-w-2xl text-xl font-semibold leading-snug sm:text-2xl">{presentation.reason}</p>
    {result.ticket && <div className="mt-8 w-full max-w-xl rounded-2xl border border-current/25 bg-white/40 p-5 text-left sm:p-7">
      <p className="text-lg font-semibold">{result.ticket.ticketTypeName}</p>
      <p className="mt-2 break-all font-mono text-2xl font-bold tracking-wider sm:text-3xl">{result.ticket.serial}</p>
      {original && <div className="mt-5 border-t border-current/20 pt-4 text-base"><p className="flex items-center gap-2 font-semibold"><Clock3 className="size-5" aria-hidden="true" />Already checked in</p><p className="mt-1">{formatTime(original.checkedInAt)} · {original.gate}</p></div>}
      {admitted && result.checkedInAt && <p className="mt-4 border-t border-current/20 pt-4 text-lg font-semibold">{formatTime(result.checkedInAt)} · {result.gate}</p>}
    </div>}
    {canConfirm && onConfirm && <Button size="xl" onClick={onConfirm} disabled={busy} className="mt-8 w-full max-w-xl border border-current/20 bg-brand-900 text-white hover:bg-brand-700">{busy ? "Confirming…" : "Confirm admission"}</Button>}
    {!admitted && !canConfirm && <Button size="xl" variant="outline" onClick={onDismiss} className="mt-8 w-full max-w-xl border-current/40 bg-transparent text-current hover:bg-black/5">Tap to continue</Button>}
    {admitted && <p className="mt-7 text-lg font-semibold">Ready for next ticket</p>}
  </div>;
}
