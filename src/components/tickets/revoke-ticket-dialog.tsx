"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, type ApiFailure } from "@/lib/api-client";

interface RevokeTicketDialogProps {
  ticketId: string;
  serial: string;
}

/**
 * Revocation requires an explicit reason (business rule 11) and is final:
 * the dialog states that up front, and the server enforces the same rules.
 */
export function RevokeTicketDialog({ ticketId, serial }: RevokeTicketDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  async function revoke() {
    setSaving(true);
    setError(null);
    const result = await apiFetch<{ ticket: { status: string } }>(
      `/api/v1/tickets/${ticketId}/revoke`,
      {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      },
    );
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    toast.success(`${serial} revoked.`);
    setOpen(false);
    setReason("");
    setSaving(false);
    router.refresh();
  }

  const canSubmit = reason.trim().length >= 3 && !saving;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm" className="min-h-11 text-base">
            <Ban /> Revoke ticket
          </Button>
        }
      />
      <DialogContent className="top-auto bottom-0 left-0 max-h-[90dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-[18px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[18px]">
        <DialogHeader>
          <DialogTitle>Revoke {serial}?</DialogTitle>
          <DialogDescription>
            The ticket will be permanently refused at the gate. Revocation
            cannot be undone through the app, and the reason is stored in the
            audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label htmlFor="revoke-reason" className="text-sm font-semibold">
            Reason (required)
          </label>
          <Textarea
            id="revoke-reason"
            rows={3}
            maxLength={500}
            placeholder="e.g. Print defect observed during sample check"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={saving}
          />
          {error ? (
            <p role="alert" className="rounded-[12px] border border-danger/40 bg-danger/10 p-3 text-base text-danger-foreground">
              {error.message}
            </p>
          ) : null}
        </div>

        <DialogFooter className="sticky bottom-0 gap-2 border-t bg-popover pt-3">
          <DialogClose
            render={<Button variant="outline" size="sm" className="min-h-12 w-full sm:w-auto" disabled={saving} />}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            className="min-h-12 w-full text-base sm:w-auto"
            disabled={!canSubmit}
            onClick={() => void revoke()}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Ban />}
            Revoke permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
