"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CorrectionButton({ checkInId }: { checkInId: string }) {
  const [busy, setBusy] = useState(false);
  const correct = async () => {
    const confirmedTicketSerial = window.prompt("Enter the ticket serial to confirm the affected record:");
    if (!confirmedTicketSerial) return;
    const reason = window.prompt("Reason for recording this check-in correction:");
    if (!reason) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/check-in/${checkInId}/correction`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmedTicketSerial, reason }) });
      if (!response.ok) throw new Error("Correction could not be recorded.");
      window.location.reload();
    } catch (error) { window.alert(error instanceof Error ? error.message : "Correction failed."); }
    finally { setBusy(false); }
  };
  return <Button size="sm" variant="outline" disabled={busy} onClick={() => void correct()}>{busy ? "Saving…" : "Record correction"}</Button>;
}
