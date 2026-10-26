"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface TicketActionsProps {
  ticketId: string;
  serial: string;
  canPrint: boolean;
  /** False for cancelled/revoked stock — those can never be printed (rule 8). */
  printable: boolean;
  /** True once the ticket has any recorded print — needs ticket:reprint. */
  hasPrintHistory: boolean;
}

/**
 * Single-ticket print/reprint. The server re-checks permissions, records a
 * PrintBatch and an audit row, and reproduces the identical QR token; this
 * component only downloads the resulting PDF (never sees token material).
 */
export function TicketActions({
  ticketId,
  serial,
  canPrint,
  printable,
  hasPrintHistory,
}: TicketActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!canPrint || !printable) return null;

  async function download() {
    setPending(true);
    try {
      const response = await fetch(`/api/v1/tickets/${ticketId}/reprint`, {
        method: "POST",
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("application/pdf")) {
        let message = "Could not print this ticket. Please try again.";
        try {
          const payload = (await response.json()) as {
            error?: { message?: string };
          };
          if (payload.error?.message) message = payload.error.message;
        } catch {
          // Non-JSON error body; keep the generic message.
        }
        toast.error(message);
        return;
      }

      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `ksp-${serial}.pdf`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      toast.success(
        hasPrintHistory
          ? `Reprint recorded for ${serial}.`
          : `Print recorded for ${serial}.`,
      );
      router.refresh();
    } catch {
      toast.error(
        "Could not reach the server. The print was NOT recorded — try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" disabled={pending} onClick={() => void download()}>
      {pending ? <Loader2 className="animate-spin" /> : <Printer />}
      {hasPrintHistory ? `Reprint ${serial}` : `Print ${serial}`}
    </Button>
  );
}
