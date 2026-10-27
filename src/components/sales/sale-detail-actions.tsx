"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  return <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-border p-4"><h2 className="font-semibold">Record payment received</h2><p className="text-sm text-muted-foreground">Outstanding: UGX {new Intl.NumberFormat("en-UG").format(balanceUgx)}. This records staff-confirmed receipt; a reference alone is not proof of payment.</p>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">Amount (UGX)<Input type="number" min={1} max={balanceUgx} step={1} value={amountUgx} onChange={(e) => setAmount(e.target.value)} /></label><label className="grid gap-1 text-sm">Method<select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label><label className="grid gap-1 text-sm">Reference (optional)<Input maxLength={120} value={externalRef} onChange={(e) => setExternalRef(e.target.value)} /></label></div><div><Button disabled={busy || !amountUgx}>{busy ? "Recording…" : "Record payment"}</Button></div></form>;
}

export function SaleAdminActions({ saleId, canCancel, canRefund }: { saleId: string; canCancel: boolean; canRefund: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function action(kind: "cancel" | "refund") {
    const reason = window.prompt(kind === "refund" ? "Reason for refund" : "Reason for cancellation");
    if (!reason) return;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (kind === "refund") headers["Idempotency-Key"] = crypto.randomUUID();
    const response = await fetch(`/api/v1/sales/${saleId}/${kind}`, { method: "POST", headers, body: JSON.stringify({ reason }) });
    const data = await response.json();
    if (!response.ok) setError(data.error?.message ?? `${kind} failed.`);
    else router.refresh();
  }
  return <div className="flex flex-wrap items-center gap-2">{canCancel ? <Button variant="outline" size="sm" onClick={() => void action("cancel")}>Cancel sale</Button> : null}{canRefund ? <Button variant="destructive" size="sm" onClick={() => void action("refund")}>Refund sale</Button> : null}{error ? <span role="alert" className="text-sm text-destructive">{error}</span> : null}</div>;
}

export function ReversePaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function reverse() {
    const reason = window.prompt("Reason for payment reversal");
    if (!reason) return;
    const response = await fetch(`/api/v1/payments/${paymentId}/reverse`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ reason }) });
    const data = await response.json();
    if (!response.ok) setError(data.error?.message ?? "Payment reversal failed."); else router.refresh();
  }
  return <span className="inline-flex items-center gap-2"><Button size="xs" variant="outline" onClick={() => void reverse()}>Reverse</Button>{error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}</span>;
}
