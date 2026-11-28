"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

/** Guarded action confirm. AlertDialog is the ReUI owner for destructive confirms. */
export function ConfirmSheet({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  details,
  reasonLabel,
  reasonPlaceholder,
  confirmationLabel,
  confirmationPlaceholder,
  confirmLabel,
  destructive = false,
  onConfirm,
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
      if (!next) {
        setReason("");
        setConfirmation("");
        setError("");
      }
    }
  }

  async function confirm() {
    if (reasonLabel && reason.trim().length < 3) return;
    if (confirmationLabel && !confirmation.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await onConfirm(reason.trim(), confirmation.trim());
      if (result !== false) changeOpen(false, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(next) => changeOpen(next)}>
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia className={destructive ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"}>
            {destructive ? <TriangleAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {details ? (
          <div role="group" aria-label="Action details" className="rounded-lg bg-muted/50 p-3 text-sm">
            {details}
          </div>
        ) : null}

        {confirmationLabel ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {confirmationLabel}
            <Input
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder={confirmationPlaceholder}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
            />
          </label>
        ) : null}

        {reasonLabel ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {reasonLabel}
            <Textarea
              rows={3}
              maxLength={500}
              placeholder={reasonPlaceholder ?? "Enter a reason"}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
            />
          </label>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={
              busy ||
              Boolean(reasonLabel && reason.trim().length < 3) ||
              Boolean(confirmationLabel && !confirmation.trim())
            }
            onClick={() => void confirm()}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
