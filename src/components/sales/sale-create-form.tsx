"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventDto } from "@/server/services/events.service";
import type { TicketTypeDto } from "@/server/services/ticket-types.service";

interface Props { events: EventDto[]; initialEventId?: string; initialTypes: TicketTypeDto[]; canDiscount: boolean; }
const money = (amount: number) => `UGX ${new Intl.NumberFormat("en-UG").format(amount)}`;

export function SaleCreateForm({ events, initialEventId, initialTypes, canDiscount }: Props) {
  const router = useRouter();
  const [eventId, setEventId] = useState(initialEventId ?? events[0]?.id ?? "");
  const [ticketTypes, setTicketTypes] = useState(initialTypes);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [externalRef, setExternalRef] = useState("");
  const [discountUgx, setDiscountUgx] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const subtotal = useMemo(() => ticketTypes.reduce((sum, type) => sum + (quantities[type.id] ?? 0) * type.priceUgx, 0), [ticketTypes, quantities]);

  async function changeEvent(id: string) {
    setEventId(id);
    setQuantities({});
    setTicketTypes([]);
    if (!id) return;
    const response = await fetch(`/api/v1/events/${encodeURIComponent(id)}/ticket-types`);
    const data = await response.json();
    if (!response.ok) { setError(data.error?.message ?? "Could not load ticket categories."); return; }
    setTicketTypes(data.ticketTypes ?? []);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const items = ticketTypes.filter((type) => (quantities[type.id] ?? 0) > 0).map((type) => ({ ticketTypeId: type.id, quantity: quantities[type.id] }));
    const amount = paymentAmount === "" ? undefined : Number(paymentAmount);
    const discount = discountUgx === "" ? undefined : Number(discountUgx);
    const body = {
      eventId,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      notes: notes || undefined,
      items,
      ...(discount ? { discountUgx: discount, discountReason } : {}),
      ...(amount === undefined ? {} : { initialPayment: { amountUgx: amount, method: paymentMethod, externalRef: externalRef || undefined } }),
    };
    try {
      const response = await fetch("/api/v1/sales", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "Sale could not be confirmed."); setBusy(false); return; }
      router.push(`/sales/${data.sale.id}`);
    } catch {
      setError("Connection failed. Retry to safely submit this sale."); setBusy(false);
    }
  }

  const field = "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div> : null}
      <section className="rounded-lg border border-border p-4">
        <h2 className="font-semibold">Customer and event</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Event<select className={field} required value={eventId} onChange={(e) => void changeEvent(e.target.value)}><option value="">Select an event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm">Customer name (optional)<Input maxLength={120} value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Phone (optional)<Input maxLength={40} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Notes (optional)<Input maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
      </section>
      <section className="rounded-lg border border-border p-4">
        <h2 className="font-semibold">Tickets</h2>
        <div className="mt-3 divide-y divide-border">
          {ticketTypes.filter((type) => type.status === "ACTIVE").map((type) => (
            <div key={type.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><div className="font-medium">{type.name}</div><div className="text-sm text-muted-foreground">{money(type.priceUgx)} each</div></div>
              <label className="flex items-center gap-2 text-sm">Quantity<Input type="number" min={0} max={500} className="w-24" value={quantities[type.id] ?? 0} onChange={(e) => setQuantities((current) => ({ ...current, [type.id]: Math.max(0, Math.min(500, Number(e.target.value))) }))} /></label>
            </div>
          ))}
          {ticketTypes.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Select an event with active ticket categories.</p> : null}
        </div>
        {canDiscount ? <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Administrator discount (UGX)<Input type="number" min={1} max={subtotal} step={1} value={discountUgx} onChange={(e) => setDiscountUgx(e.target.value)} /></label><label className="grid gap-1 text-sm">Reason (required with discount)<Input maxLength={500} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} /></label></div> : null}
        <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold"><span>Estimated total</span><span>{money(Math.max(0, subtotal - (Number(discountUgx) || 0)))}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">The server recalculates prices and confirms available inventory.</p>
      </section>
      <section className="rounded-lg border border-border p-4">
        <h2 className="font-semibold">Payment received (optional)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Record only funds staff have confirmed as received. A reference alone does not verify payment.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">Amount in UGX<Input inputMode="numeric" type="number" min={1} step={1} max={2_000_000_000} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Method<select className={field} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
          <label className="grid gap-1 text-sm">Transaction reference (optional)<Input maxLength={120} value={externalRef} onChange={(e) => setExternalRef(e.target.value)} /></label>
        </div>
      </section>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => router.back()}>Back</Button><Button disabled={busy || subtotal <= 0}>{busy ? "Confirming…" : "Confirm sale"}</Button></div>
    </form>
  );
}
