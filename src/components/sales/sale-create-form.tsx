"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUGX } from "@/components/ui/money";
import type { EventDto } from "@/server/services/events.service";
import type { TicketTypeDto } from "@/server/services/ticket-types.service";

interface Props { events: EventDto[]; initialEventId?: string; initialTypes: TicketTypeDto[]; canDiscount: boolean; }
const STEPS = ["Customer", "Tickets", "Review", "Payment", "Confirm"] as const;
type Step = (typeof STEPS)[number];

export function SaleCreateForm({ events, initialEventId, initialTypes, canDiscount }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("Customer");
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Retain this key across retries exactly as the existing sale flow does.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const subtotal = useMemo(() => ticketTypes.reduce((sum, type) => sum + (quantities[type.id] ?? 0) * type.priceUgx, 0), [ticketTypes, quantities]);
  const discount = Number(discountUgx) || 0;
  const total = Math.max(0, subtotal - discount);
  const paid = Number(paymentAmount) || 0;
  const balance = Math.max(0, total - paid);
  const stepIndex = STEPS.indexOf(step);
  const activeTypes = ticketTypes.filter((type) => type.status === "ACTIVE");

  async function changeEvent(id: string) {
    setEventId(id); setQuantities({}); setTicketTypes([]); setError(""); setFieldErrors({});
    if (!id) return;
    try {
      const response = await fetch(`/api/v1/events/${encodeURIComponent(id)}/ticket-types`);
      const data = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "Could not load ticket categories."); return; }
      setTicketTypes(data.ticketTypes ?? []);
    } catch { setError("Could not load ticket categories. Check your connection and retry."); }
  }

  function setQuantity(typeId: string, value: number) {
    setQuantities((current) => ({ ...current, [typeId]: Math.max(0, Math.min(500, Math.trunc(value) || 0)) }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setFieldErrors({});
    const items = activeTypes.filter((type) => (quantities[type.id] ?? 0) > 0).map((type) => ({ ticketTypeId: type.id, quantity: quantities[type.id] }));
    const amount = paymentAmount === "" ? undefined : Number(paymentAmount);
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
      if (!response.ok) {
        setError(data.error?.message ?? "Sale could not be confirmed.");
        if (Array.isArray(data.error?.details)) setFieldErrors(Object.fromEntries(data.error.details.map((detail: { path: string; message: string }) => [detail.path, detail.message])));
        setBusy(false); return;
      }
      router.push(`/sales/${data.sale.id}`);
    } catch { setError("Connection failed. Retry to safely submit this sale."); setBusy(false); }
  }

  function advance() {
    setError(""); setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);
  }
  function back() { setError(""); setStep(STEPS[Math.max(stepIndex - 1, 0)]); }

  const fieldClass = "min-h-12 w-full rounded-md border border-input bg-background px-3 text-base";
  return <form onSubmit={submit} className="flex min-h-[min(640px,calc(100dvh-12rem))] flex-col gap-3">
    <nav aria-label="Sale progress" className="rounded-xl border bg-card p-3">
      <ol className="grid grid-cols-5 gap-1">{STEPS.map((name, index) => <li key={name} aria-label={name} aria-current={step === name ? "step" : undefined} className={`min-w-0 text-center ${index <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}><span aria-hidden="true" className="mx-auto flex size-8 items-center justify-center rounded-full border text-base">{index + 1}</span></li>)}</ol>
      <p className="mt-2 text-center text-base font-medium">Step {stepIndex + 1} of {STEPS.length}: {step}</p>
    </nav>
    <p className="sr-only" aria-live="polite">Step {stepIndex + 1} of {STEPS.length}: {step}</p>
    {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-base text-danger-foreground">{error}</p>}

    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card p-4">
      {step === "Customer" && <section className="grid gap-3"><div><h2 className="text-lg font-semibold">Customer and event</h2><p className="text-base text-muted-foreground">Customer details are optional.</p></div>
        <label className="grid gap-1 text-base">Event<select className={fieldClass} required value={eventId} onChange={(e) => void changeEvent(e.target.value)} aria-describedby={fieldErrors.eventId ? "sale-event-error" : undefined}><option value="">Select an event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select>{fieldErrors.eventId && <span id="sale-event-error" className="text-base text-danger-foreground">{fieldErrors.eventId}</span>}</label>
        <label className="grid gap-1 text-base">Customer name (optional)<Input autoComplete="name" maxLength={120} value={customerName} aria-describedby={fieldErrors.customerName ? "sale-customer-name-error" : undefined} onChange={(e) => setCustomerName(e.target.value)} />{fieldErrors.customerName && <span id="sale-customer-name-error" className="text-base text-danger-foreground">{fieldErrors.customerName}</span>}</label>
        <label className="grid gap-1 text-base">Phone (optional)<Input type="tel" inputMode="tel" autoComplete="tel" maxLength={40} value={customerPhone} aria-describedby={fieldErrors.customerPhone ? "sale-customer-phone-error" : undefined} onChange={(e) => setCustomerPhone(e.target.value)} />{fieldErrors.customerPhone && <span id="sale-customer-phone-error" className="text-base text-danger-foreground">{fieldErrors.customerPhone}</span>}</label>
      </section>}

      {step === "Tickets" && <section><h2 className="text-lg font-semibold">Choose tickets</h2><div className="mt-2 divide-y divide-border">{activeTypes.map((type) => {
        const quantity = quantities[type.id] ?? 0;
        return <div key={type.id} className="flex min-h-16 items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-base font-medium">{type.name}</p><p className="text-base text-muted-foreground">{formatUGX(type.priceUgx)} each</p></div><div className="flex shrink-0 items-center gap-2"><Button type="button" variant="outline" size="icon" aria-label={`Remove one ${type.name}`} className="size-11" disabled={quantity === 0} onClick={() => setQuantity(type.id, quantity - 1)}><Minus /></Button><Input aria-label={`${type.name} quantity`} type="number" inputMode="numeric" min={0} max={500} className="h-12 w-16 text-center text-base tabular-nums" value={quantity} onChange={(e) => setQuantity(type.id, Number(e.target.value))} /><Button type="button" variant="outline" size="icon" aria-label={`Add one ${type.name}`} className="size-11" disabled={quantity >= 500} onClick={() => setQuantity(type.id, quantity + 1)}><Plus /></Button></div></div>;
      })}{activeTypes.length === 0 && <p className="py-4 text-base text-muted-foreground">Select an event with active ticket categories.</p>}</div>
        {canDiscount && <div className="mt-3 grid gap-3 border-t pt-3"><label className="grid gap-1 text-base">Administrator discount (UGX)<Input type="number" inputMode="numeric" min={1} max={subtotal} step={1} value={discountUgx} onChange={(e) => setDiscountUgx(e.target.value)} /></label><label className="grid gap-1 text-base">Reason (required with discount)<Input maxLength={500} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} /></label></div>}
      </section>}

      {step === "Review" && <section className="grid gap-3"><h2 className="text-lg font-semibold">Review sale</h2><p className="text-base">{events.find((event) => event.id === eventId)?.name}</p><ul className="divide-y">{activeTypes.filter((type) => quantities[type.id]).map((type) => <li key={type.id} className="flex justify-between gap-3 py-2 text-base"><span>{quantities[type.id]} × {type.name}</span><span className="tabular-nums">{formatUGX(quantities[type.id] * type.priceUgx)}</span></li>)}</ul>{discount > 0 && <p className="text-base">Discount: −{formatUGX(discount)} · {discountReason}</p>}<p className="border-t pt-3 text-base font-semibold">Customer: {customerName || "Not provided"}{customerPhone ? ` · ${customerPhone}` : ""}</p><label className="grid gap-1 text-base">Notes (optional)<Input maxLength={1000} value={notes} aria-describedby={fieldErrors.notes ? "sale-notes-error" : undefined} onChange={(e) => setNotes(e.target.value)} />{fieldErrors.notes && <span id="sale-notes-error" className="text-base text-danger-foreground">{fieldErrors.notes}</span>}</label></section>}

      {step === "Payment" && <section className="grid gap-3"><h2 className="text-lg font-semibold">Record payment received</h2><p className="text-base text-muted-foreground">Only record funds staff have confirmed as received. A reference alone does not verify payment.</p><label className="grid gap-1 text-base">Amount in UGX (optional)<Input inputMode="numeric" type="number" min={1} step={1} max={2_000_000_000} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></label><label className="grid gap-1 text-base">Method<select className={fieldClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label><label className="grid gap-1 text-base">Transaction reference (optional)<Input maxLength={120} value={externalRef} onChange={(e) => setExternalRef(e.target.value)} /></label></section>}

      {step === "Confirm" && <section className="grid gap-3"><h2 className="text-lg font-semibold">Confirm sale</h2><dl className="grid gap-2 text-base"><div className="flex justify-between gap-4"><dt>Total</dt><dd className="font-semibold tabular-nums">{formatUGX(total)}</dd></div><div className="flex justify-between gap-4"><dt>Recorded payment</dt><dd className="tabular-nums">{formatUGX(paid)}</dd></div><div className="flex justify-between gap-4 border-t pt-2 font-semibold"><dt>Balance due</dt><dd className="tabular-nums">{formatUGX(balance)}</dd></div></dl><p className="text-base text-muted-foreground">The server recalculates prices, checks inventory, and records the sale.</p></section>}
    </div>

    <footer className="sticky bottom-16 z-10 rounded-xl border bg-background/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur md:bottom-0">
      <div className="mb-3 flex items-center justify-between gap-3 text-base"><span>Total <strong className="tabular-nums">{formatUGX(total)}</strong></span><span>Balance <strong className="tabular-nums">{formatUGX(balance)}</strong></span></div>
      <div className="flex justify-between gap-2">{stepIndex > 0 ? <Button type="button" variant="outline" className="min-h-12" onClick={back}><ArrowLeft /> Back</Button> : <Button type="button" variant="outline" className="min-h-12" onClick={() => router.back()}>Cancel</Button>}
        {step === "Confirm" ? <Button type="submit" className="min-h-14 flex-1" disabled={busy || subtotal <= 0}>{busy ? "Confirming…" : "Confirm sale"}</Button> : <Button type="button" className="min-h-14 flex-1" disabled={(step === "Customer" && !eventId) || (step === "Tickets" && subtotal <= 0)} onClick={advance}>Continue <ArrowRight /></Button>}
      </div>
    </footer>
  </form>;
}
