"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { Input } from "@/components/ui/input";

export function PaymentForm({ saleId, balanceUgx }: { saleId: string; balanceUgx: number }) {
  const router = useRouter();
  const [amountUgx, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [externalRef, setExternalRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/sales/${saleId}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ amountUgx: Number(amountUgx), method, externalRef: externalRef || undefined }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "Payment could not be recorded."); setKey(crypto.randomUUID()); setBusy(false); return; }
      router.refresh();
    } catch { setError("Connection failed. Retry to safely record this payment."); setBusy(false); }
  }
  return <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-border p-4"><h2 className="font-semibold">Record payment received</h2><p className="text-base text-muted-foreground">Outstanding: UGX {new Intl.NumberFormat("en-UG").format(balanceUgx)}. This records staff-confirmed receipt; a reference alone is not proof of payment.</p>{error ? <p role="alert" className="text-base text-danger-foreground">{error}</p> : null}<div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-base">Amount (UGX)<Input inputMode="numeric" type="number" min={1} max={balanceUgx} step={1} value={amountUgx} onChange={(e) => setAmount(e.target.value)} /></label><label className="grid gap-1 text-base">Method<select className="min-h-12 rounded-md border border-input bg-background px-3 text-base" value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label><label className="grid gap-1 text-base">Reference (optional)<Input maxLength={120} value={externalRef} onChange={(e) => setExternalRef(e.target.value)} /></label></div><div className="sticky bottom-16 z-10 rounded-xl border bg-background/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur md:bottom-0"><Button className="min-h-14 w-full sm:w-auto" disabled={busy || !amountUgx}>{busy ? "Recording…" : "Record payment"}</Button></div></form>;
}

export function SaleAdminActions({ saleId, reference, totalUgx, canCancel, canRefund }: { saleId: string; reference: string; totalUgx: number; canCancel: boolean; canRefund: boolean }) {
  const router = useRouter();
  async function action(kind: "cancel" | "refund", reason: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (kind === "refund") headers["Idempotency-Key"] = crypto.randomUUID();
    const response = await fetch(`/api/v1/sales/${saleId}/${kind}`, { method: "POST", headers, body: JSON.stringify({ reason }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? `${kind} failed.`);
    toast.success(kind === "refund" ? "Sale refund recorded." : "Sale cancelled.");
    router.refresh();
  }
  const referenceDetails = <><p className="font-semibold">{reference}</p><p>Total UGX {new Intl.NumberFormat("en-UG").format(totalUgx)}</p></>;
  return <div className="flex flex-wrap items-center gap-2">{canCancel ? <ConfirmSheet trigger={<Button variant="outline" size="sm" className="min-h-11 text-base">Cancel sale</Button>} title={`Cancel ${reference}?`} description="This will cancel the outstanding sale. Enter a reason for the audit record." details={referenceDetails} reasonLabel="Reason (required)" confirmLabel="Cancel sale" destructive onConfirm={(reason) => action("cancel", reason)} /> : null}{canRefund ? <ConfirmSheet trigger={<Button variant="destructive" size="sm" className="min-h-11 text-base">Refund sale</Button>} title={`Refund ${reference}?`} description="This will record a refund against this sale. Enter a reason for the audit record." details={referenceDetails} reasonLabel="Reason (required)" confirmLabel="Refund sale" destructive onConfirm={(reason) => action("refund", reason)} /> : null}</div>;
}

export function ReversePaymentButton({ paymentId, reference, amountUgx }: { paymentId: string; reference: string; amountUgx: number }) {
  const router = useRouter();
  async function reverse(reason: string) {
    const response = await fetch(`/api/v1/payments/${paymentId}/reverse`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ reason }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "Payment reversal failed.");
    toast.success("Payment reversal recorded."); router.refresh();
  }
  return <ConfirmSheet trigger={<Button size="sm" className="min-h-11 text-base" variant="outline">Reverse</Button>} title={`Reverse payment ${reference}?`} description="This creates a linked payment reversal. Enter a reason for the audit record." details={<><p className="font-semibold">{reference}</p><p>Recorded amount UGX {new Intl.NumberFormat("en-UG").format(amountUgx)}</p></>} reasonLabel="Reason (required)" confirmLabel="Reverse payment" destructive onConfirm={reverse} />;
}
