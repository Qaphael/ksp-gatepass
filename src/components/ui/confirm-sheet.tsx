"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<boolean | void>;
}

/** Mobile bottom sheet / desktop dialog for guarded actions. */
export function ConfirmSheet({
  trigger, open, onOpenChange, title, description, details, reasonLabel,
  reasonPlaceholder, confirmLabel, destructive = false, onConfirm,
}: ConfirmSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isOpen = open ?? internalOpen;

  function changeOpen(next: boolean, force = false) {
    if (!busy || force) {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
      if (!next) { setReason(""); setError(""); }
    }
  }

  async function confirm() {
    if (reasonLabel && reason.trim().length < 3) return;
    setBusy(true); setError("");
    try {
      const result = await onConfirm(reason.trim());
      if (result !== false) changeOpen(false, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed. Try again.");
    } finally { setBusy(false); }
  }

  return <Dialog open={isOpen} onOpenChange={(next) => changeOpen(next)}>
    {trigger ? <DialogTrigger render={trigger} /> : null}
    <DialogContent className="top-auto bottom-0 left-0 max-h-[90dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      {details ? <div className="rounded-lg border bg-muted/40 p-3 text-base">{details}</div> : null}
      {reasonLabel ? <label className="grid gap-2 text-base font-medium">{reasonLabel}<Textarea rows={3} maxLength={500} placeholder={reasonPlaceholder ?? "Enter a reason"} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label> : null}
      {error ? <p role="alert" className="text-base text-danger-foreground">{error}</p> : null}
      <DialogFooter className="sticky bottom-0 gap-2 bg-popover pt-2">
        <Button type="button" variant="outline" className="min-h-12" disabled={busy} onClick={() => changeOpen(false)}>Cancel</Button>
        <Button type="button" variant={destructive ? "destructive" : "default"} className="min-h-12" disabled={busy || Boolean(reasonLabel && reason.trim().length < 3)} onClick={() => void confirm()}>{busy ? "Working…" : confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
