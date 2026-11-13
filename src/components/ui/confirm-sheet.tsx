"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ConfirmSheetProps {
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  details?: ReactNode;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  confirmationLabel?: string;
  confirmationPlaceholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (reason: string, confirmation?: string) => Promise<boolean | void>;
}

/** Mobile bottom sheet / desktop dialog for guarded actions. */
export function ConfirmSheet({
  trigger, open, onOpenChange, title, description, details, reasonLabel,
  reasonPlaceholder, confirmationLabel, confirmationPlaceholder, confirmLabel, destructive = false, onConfirm,
}: ConfirmSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isOpen = open ?? internalOpen;

  function changeOpen(next: boolean, force = false) {
    if (!busy || force) {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
      if (!next) { setReason(""); setConfirmation(""); setError(""); }
    }
  }

  async function confirm() {
    if (reasonLabel && reason.trim().length < 3) return;
    if (confirmationLabel && !confirmation.trim()) return;
    setBusy(true); setError("");
    try {
      const result = await onConfirm(reason.trim(), confirmation.trim());
      if (result !== false) changeOpen(false, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed. Try again.");
    } finally { setBusy(false); }
  }

  return <Dialog open={isOpen} onOpenChange={(next) => changeOpen(next)}>
    {trigger ? <DialogTrigger render={trigger} /> : null}
    <DialogContent className="top-auto bottom-0 left-0 max-h-[90dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-[18px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[18px]">
      <DialogHeader className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
        <span className={destructive ? "grid size-11 place-items-center rounded-[14px] bg-danger/10 text-danger-foreground" : "grid size-11 place-items-center rounded-[14px] bg-accent text-primary"} aria-hidden="true">
          {destructive ? <TriangleAlert className="size-5" /> : <ShieldCheck className="size-5" />}
        </span>
        <div className="grid min-w-0 gap-2"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div>
      </DialogHeader>
      {details ? <div role="group" aria-label="Action details" className="rounded-[14px] border border-border/70 bg-muted/50 p-4 text-base">{details}</div> : null}
      {confirmationLabel ? <label className="grid gap-1.5 text-sm font-semibold">{confirmationLabel}<Input autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder={confirmationPlaceholder} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label> : null}
      {reasonLabel ? <label className="grid gap-1.5 text-sm font-semibold">{reasonLabel}<Textarea rows={3} maxLength={500} placeholder={reasonPlaceholder ?? "Enter a reason"} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label> : null}
      {error ? <p role="alert" className="rounded-[12px] border border-danger/40 bg-danger/10 p-3 text-base text-danger-foreground">{error}</p> : null}
      <DialogFooter className="sticky bottom-0 gap-2 border-t bg-popover pt-4">
        <Button type="button" variant="outline" className="min-h-12 w-full sm:w-auto" disabled={busy} onClick={() => changeOpen(false)}>Cancel</Button>
        <Button type="button" variant={destructive ? "destructive" : "default"} className="min-h-12 w-full sm:w-auto" disabled={busy || Boolean(reasonLabel && reason.trim().length < 3) || Boolean(confirmationLabel && !confirmation.trim())} onClick={() => void confirm()}>{busy ? "Working…" : confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
