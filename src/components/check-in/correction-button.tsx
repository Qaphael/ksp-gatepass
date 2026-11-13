"use client";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function CorrectionButton({ checkInId }: { checkInId: string }) {
  const router = useRouter();
  return <ConfirmSheet
    trigger={<Button size="sm" variant="outline" className="min-h-12">Record correction</Button>}
    title="Record check-in correction?"
    description="This adds a correction to the admission history. The original check-in remains in the audit trail."
    confirmationLabel="Confirm the ticket serial"
    confirmationPlaceholder="KSP-00001"
    reasonLabel="Reason (required)"
    reasonPlaceholder="Explain why this admission is being corrected"
    confirmLabel="Record correction"
    destructive
    onConfirm={async (reason, confirmedTicketSerial) => {
      const response = await fetch(`/api/v1/check-in/${checkInId}/correction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmedTicketSerial, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Correction could not be recorded.");
      toast.success("Check-in correction recorded.");
      router.refresh();
    }}
  />;
}
