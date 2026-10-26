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
          <Button variant="destructive" size="sm">
            <Ban /> Revoke ticket
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke {serial}?</DialogTitle>
          <DialogDescription>
            The ticket will be permanently refused at the gate. Revocation
            cannot be undone through the app, and the reason is stored in the
            audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label htmlFor="revoke-reason" className="text-xs font-medium">
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
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" size="sm" disabled={saving} />}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
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
