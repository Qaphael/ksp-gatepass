"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Ban, CalendarOff, CalendarX, Clock, QrCode, SearchX, ShieldBan, Tags, TicketX, Trash2, UserRound, UserRoundX, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { QrCamera } from "@/components/scanner/qr-camera";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatUGX } from "@/components/ui/money";
import { normalizeUgandaPhone } from "@/lib/phone/uganda";
import { useServerHeartbeat } from "@/hooks/use-server-heartbeat";
import { addCartTicket, removeCartTicket, SALE_LOOKUP_PRESENTATION, type SaleLookupState, type SaleLookupTone, type ScanCartTicket } from "@/components/sales/scan-to-sell-model";

type SellEvent = {
  id: string;
  name: string;
  requireBuyerDetails: boolean;
  requireFullPaymentAtSale: boolean;
  allowSellerManualSale: boolean;
  buyerNoticeText: string | null;
};
type Props = { events: SellEvent[]; initialEventId?: string };
type LookupResponse = { state: SaleLookupState; message: string; ticket?: { serial: string; ticketTypeName: string; priceUgx: number }; buyerNoticeText: string | null };
type SaleResponse = { sale: { id: string; reference: string; totalUgx: number; items: Array<{ tickets: Array<{ serial: string }> }> } };
type LookupNotice = { state?: SaleLookupState; message: string; tone: SaleLookupTone; icon?: string };

const icons: Record<string, LucideIcon> = {
  "badge-check": BadgeCheck, "qr-code": QrCode, "search-x": SearchX, "calendar-x": CalendarX,
  "ticket-x": TicketX, "user-round-x": UserRoundX, "user-round": UserRound, ban: Ban,
  "shield-ban": ShieldBan, "clock-alert": Clock, tags: Tags, "calendar-off": CalendarOff,
};
const toneClasses: Record<SaleLookupTone, string> = {
  success: "border-success/40 bg-success/10 text-success-foreground",
  warning: "border-warning/40 bg-warning/10 text-warning-foreground",
  danger: "border-danger/40 bg-danger/10 text-danger-foreground",
};

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export function ScanToSell({ events, initialEventId }: Props) {
  const { serverOnline, serverOnlineRef } = useServerHeartbeat();
  const [eventId, setEventId] = useState(initialEventId ?? events[0]?.id ?? "");
  const [cart, setCart] = useState<ScanCartTicket[]>([]);
  const [notice, setNotice] = useState<LookupNotice | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSerial, setManualSerial] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [nameError, setNameError] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [error, setError] = useState("");
  const [busyLookup, setBusyLookup] = useState(false);
  const [busySale, setBusySale] = useState(false);
  const [success, setSuccess] = useState<SaleResponse["sale"] | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const lookupBusyRef = useRef(false);
  const event = events.find((item) => item.id === eventId);
  const total = useMemo(() => cart.reduce((sum, ticket) => sum + ticket.priceUgx, 0), [cart]);
  const amount = paymentAmount === "" ? 0 : Number(paymentAmount);
  const fullPaymentRequired = Boolean(event?.requireFullPaymentAtSale);
  const buyerRequired = Boolean(event?.requireBuyerDetails);
  const manualAllowed = Boolean(event?.allowSellerManualSale);
  const buyerNotice = event?.buyerNoticeText?.trim();

  function changeEvent(nextId: string) {
    setEventId(nextId);
    setCart([]); setNotice(null); setError(""); setSuccess(null); setBuyerName(""); setBuyerPhone(""); setPaymentAmount("");
    setIdempotencyKey(crypto.randomUUID());
  }

  async function lookup(source: { token: string } | { serial: string; entryMethod: "MANUAL" }) {
    if (!eventId || !serverOnlineRef.current || lookupBusyRef.current || success) return;
    lookupBusyRef.current = true; setBusyLookup(true); setError("");
    try {
      const response = await fetch("/api/v1/sales/lookup-ticket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, ...( "token" in source ? { token: source.token } : { serial: source.serial }) }), cache: "no-store" });
      const data = await readJson<LookupResponse & { error?: { message?: string } }>(response);
      if (!response.ok) {
        const message = data.error?.message ?? "Ticket lookup failed. Check the connection and try again.";
        setNotice({ message, tone: "danger", icon: "search-x" });
        return;
      }
      const presentation = SALE_LOOKUP_PRESENTATION[data.state];
      if (data.state === "SALEABLE" && data.ticket) {
        const item: ScanCartTicket = {
          ...data.ticket,
          entryMethod: "token" in source ? "SCAN" : "MANUAL",
          ...( "token" in source ? { token: source.token } : {}),
        };
        const nextCart = addCartTicket(cart, item);
        if (nextCart === cart) setNotice({ state: data.state, message: `${item.serial} is already in this sale.`, tone: "warning", icon: "ticket-x" });
        else { setCart(nextCart); setNotice({ state: data.state, message: data.message, tone: presentation.tone, icon: presentation.icon }); }
      } else {
        setNotice({ state: data.state, message: data.message || presentation.message, tone: presentation.tone, icon: presentation.icon });
      }
      if ("serial" in source) { setManualSerial(""); setManualOpen(false); }
    } catch {
      setNotice({ message: "Connection failed. Ticket lookup is unavailable until the server responds.", tone: "danger", icon: "search-x" });
    } finally { lookupBusyRef.current = false; setBusyLookup(false); }
  }

  function onPhoneBlur() {
    if (!buyerPhone.trim()) { setPhoneError(buyerRequired ? "Enter the buyer’s phone number." : ""); return; }
    try { setBuyerPhone(normalizeUgandaPhone(buyerPhone)); setPhoneError(""); }
    catch (phoneIssue) { setPhoneError(phoneIssue instanceof Error ? phoneIssue.message : "Enter a valid Ugandan mobile number."); }
  }

  async function submitSale(form: React.FormEvent<HTMLFormElement>) {
    form.preventDefault();
    setError(""); setNameError(""); setPhoneError("");
    if (cart.length === 0) { setError("Scan at least one ticket before confirming."); return; }
    if (buyerRequired && !buyerName.trim()) { setNameError("Enter the buyer’s name."); return; }
    if (buyerRequired && !buyerPhone.trim()) { setPhoneError("Enter the buyer’s phone number."); return; }
    if (buyerPhone.trim()) {
      try { normalizeUgandaPhone(buyerPhone); }
      catch (phoneIssue) { setPhoneError(phoneIssue instanceof Error ? phoneIssue.message : "Enter a valid Ugandan mobile number."); return; }
    }
    if (paymentAmount !== "" && (!Number.isSafeInteger(amount) || amount < 1)) { setError("Enter a whole payment amount in UGX."); return; }
    if (amount > total) { setError("Payment cannot be greater than the sale total."); return; }
    if (fullPaymentRequired && amount < total) { setError("Full payment is required before confirming this sale."); return; }
    setBusySale(true);
    const payload = {
      eventId,
      tickets: cart.map((ticket) => ticket.entryMethod === "MANUAL" ? { serial: ticket.serial, entryMethod: "MANUAL" as const } : { token: ticket.token! }),
      ...(buyerName.trim() ? { customerName: buyerName.trim() } : {}),
      ...(buyerPhone.trim() ? { customerPhone: buyerPhone.trim() } : {}),
      ...(amount > 0 ? { initialPayment: { amountUgx: amount, method: paymentMethod } } : {}),
    };
    try {
      const response = await fetch("/api/v1/sales", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(payload) });
      const data = await readJson<SaleResponse & { error?: { message?: string; details?: Array<{ path: string; message: string }> } }>(response);
      if (!response.ok) {
        setError(data.error?.message ?? "Sale could not be confirmed. Check the details and retry.");
        for (const detail of data.error?.details ?? []) {
          if (detail.path === "customerName") setNameError(detail.message);
          if (detail.path === "customerPhone") setPhoneError(detail.message);
        }
        return;
      }
      setSuccess(data.sale);
    } catch { setError("Connection failed. Retry to safely submit this sale."); }
    finally { setBusySale(false); }
  }

  function scanNext() {
    setSuccess(null); setCart([]); setNotice(null); setBuyerName(""); setBuyerPhone(""); setPhoneError(""); setNameError(""); setPaymentAmount(""); setPaymentMethod("CASH"); setError(""); setIdempotencyKey(crypto.randomUUID());
  }

  if (success) {
    const serials = success.items.flatMap((item) => item.tickets.map((ticket) => ticket.serial));
    return <section className="mx-auto grid w-full max-w-xl gap-4 rounded-2xl border border-success/40 bg-card p-5 text-center sm:p-7" aria-live="polite">
      <BadgeCheck className="mx-auto size-14 text-success-foreground" aria-hidden="true" />
      <div><h2 className="text-2xl font-bold">Sale recorded</h2><p className="mt-1 text-base text-muted-foreground">{success.reference} · {formatUGX(success.totalUgx)}</p></div>
      <div className="rounded-xl border bg-background p-4 text-left"><p className="text-base font-semibold">Tickets sold</p><ul className="mt-2 divide-y">{serials.map((serial) => <li key={serial} className="py-2 font-mono text-base tracking-wide">{serial}</li>)}</ul></div>
      <div className="grid gap-2 sm:grid-cols-2"><Button nativeButton={false} render={<Link href={`/api/v1/sales/${success.id}/receipt.pdf`} target="_blank" />} className="min-h-14">Receipt PDF</Button><Button type="button" variant="outline" className="min-h-14" onClick={scanNext}>Scan next</Button></div>
      <Link className="min-h-11 content-center text-base underline underline-offset-4" href={`/sales/${success.id}`}>View sale details</Link>
    </section>;
  }

  const ResultIcon = notice?.icon ? icons[notice.icon] : null;
  return <form onSubmit={submitSale} className="mx-auto flex w-full max-w-3xl flex-col gap-3">
    <header className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Seller</p><h1 className="text-2xl font-semibold tracking-tight">Sell tickets</h1><p className="mt-1 text-base text-muted-foreground">Scan each printed ticket before taking payment.</p></div><div className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-base font-semibold ${serverOnline ? "border-success/40 bg-success/10 text-success-foreground" : "border-warning/50 bg-warning text-warning-foreground"}`} role="status">{serverOnline ? <Wifi className="size-4" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}{serverOnline ? "Online" : "Offline"}</div></header>
    {!serverOnline && <p role="alert" className="rounded-lg border border-warning/50 bg-warning px-4 py-3 text-base font-semibold text-warning-foreground">OFFLINE — SELLING UNAVAILABLE. Reconnect to the server before scanning or confirming sales.</p>}
    {events.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="text-lg font-semibold">No events available</h2><p className="mt-2 text-base text-muted-foreground">Ask an administrator to add you to an event workspace.</p></div> : <>
      <label className="grid gap-1 text-base font-medium">Event<select className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base" value={eventId} onChange={(e) => changeEvent(e.target.value)}>{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <QrCamera disabled={!serverOnline || !eventId || busyLookup || busySale} onScan={(token) => void lookup({ token })} label="Scan a ticket QR code" />
      {manualAllowed && <Button type="button" variant="outline" className="min-h-12 w-full" disabled={!serverOnline || busyLookup || busySale} onClick={() => setManualOpen(true)}><QrCode aria-hidden="true" />Enter serial manually</Button>}
      {notice && <div role="status" aria-live="polite" className={`flex items-start gap-3 rounded-xl border p-3 ${toneClasses[notice.tone]}`}>
        {ResultIcon ? <ResultIcon className="mt-0.5 size-6 shrink-0" aria-hidden="true" /> : null}<div><p className="font-semibold">{notice.state ? SALE_LOOKUP_PRESENTATION[notice.state].label : "Lookup issue"}</p><p className="text-base">{notice.message}</p></div>
      </div>}
      <section className="rounded-2xl border border-border/70 bg-card p-4" aria-labelledby="cart-heading"><div className="flex items-center justify-between gap-3"><h2 id="cart-heading" className="text-lg font-semibold">Ticket cart</h2><span className="text-base text-muted-foreground">{cart.length} {cart.length === 1 ? "ticket" : "tickets"}</span></div>
        {cart.length === 0 ? <p className="py-5 text-center text-base text-muted-foreground">Scan a ticket QR to add it to this sale.</p> : <ul className="mt-2 divide-y">{cart.map((ticket) => {
          const Icon = ticket.entryMethod === "MANUAL" ? QrCode : BadgeCheck;
          return <li key={ticket.serial} className="flex min-w-0 items-center gap-3 py-3"><Icon className="size-5 shrink-0 text-success-foreground" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate font-mono text-base font-semibold tracking-wide">{ticket.serial}</p><p className="truncate text-base text-muted-foreground">{ticket.ticketTypeName} · {formatUGX(ticket.priceUgx)}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-sm font-semibold ${ticket.entryMethod === "MANUAL" ? toneClasses.warning : toneClasses.success}`}>{ticket.entryMethod === "MANUAL" ? "Manual" : "Ready"}</span><Button type="button" size="icon" variant="ghost" aria-label={`Remove ticket ${ticket.serial}`} className="shrink-0" onClick={() => setCart((current) => removeCartTicket(current, ticket.serial))}><Trash2 aria-hidden="true" /></Button></li>;
        })}</ul>}
      </section>
      <section className="grid gap-3 rounded-xl border bg-card p-4" aria-labelledby="buyer-heading"><div><h2 id="buyer-heading" className="text-lg font-semibold">Buyer details</h2><p className="text-base text-muted-foreground">{buyerRequired ? "Name and phone are required for this event." : "Add buyer details if available."}</p></div>
        <label className="grid gap-1 text-base font-medium">Buyer name{buyerRequired ? " *" : ""}<Input autoComplete="name" maxLength={120} value={buyerName} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "buyer-name-error" : undefined} onChange={(e) => { setBuyerName(e.target.value); setNameError(""); }} />{nameError && <span id="buyer-name-error" className="text-base text-danger-foreground">{nameError}</span>}</label>
        <label className="grid gap-1 text-base font-medium">Buyer phone{buyerRequired ? " *" : ""}<Input type="tel" inputMode="tel" autoComplete="tel" maxLength={40} placeholder="+256 772 123 456" value={buyerPhone} aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? "buyer-phone-error" : "buyer-phone-hint"} onChange={(e) => { setBuyerPhone(e.target.value); setPhoneError(""); }} onBlur={onPhoneBlur} /><span id="buyer-phone-hint" className="text-sm text-muted-foreground">Uganda country code +256. We’ll format the number when you leave this field.</span>{phoneError && <span id="buyer-phone-error" className="text-base text-danger-foreground">{phoneError}</span>}</label>
        {buyerNotice && <p className="rounded-lg bg-muted p-3 text-base text-muted-foreground">{buyerNotice}</p>}
      </section>
      <section className="grid gap-3 rounded-xl border bg-card p-4" aria-labelledby="payment-heading"><h2 id="payment-heading" className="text-lg font-semibold">Payment received</h2><p className="text-base text-muted-foreground">Only record money you have confirmed receiving.</p>
        <label className="grid gap-1 text-base font-medium">Amount received (UGX){fullPaymentRequired ? " *" : ""}<Input type="number" inputMode="numeric" min={0} max={2_000_000_000} step={1} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={fullPaymentRequired ? String(total) : "0"} /></label>
        <label className="grid gap-1 text-base font-medium">Payment method<select className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
      </section>
      {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-base text-danger-foreground">{error}</p>}
      <footer className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 rounded-xl border bg-background/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur lg:bottom-0"><div className="mb-3 flex items-center justify-between gap-3 text-base"><span>Total</span><strong className="tabular-nums">{formatUGX(total)}</strong></div><Button type="submit" size="xl" className="w-full" disabled={!serverOnline || busySale || busyLookup || cart.length === 0}>{busySale ? "Confirming sale…" : busyLookup ? "Checking ticket…" : "Confirm sale"}</Button></footer>
    </>}
    <Dialog open={manualOpen} onOpenChange={setManualOpen}><DialogContent className="top-auto bottom-0 left-0 max-h-[90dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-[18px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[18px]">
      <DialogHeader><DialogTitle>Manual ticket entry</DialogTitle><DialogDescription>This ticket will be marked as manually entered and recorded that way in the sale audit.</DialogDescription></DialogHeader>
      <label className="grid gap-1 text-base font-medium">Ticket serial<Input autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} value={manualSerial} onChange={(e) => setManualSerial(e.target.value.toUpperCase())} placeholder="KSP-00001" /></label>
      {error && <p role="alert" className="text-base text-danger-foreground">{error}</p>}
      <DialogFooter className="border-t-0 bg-transparent pt-1 sm:justify-start"><Button type="button" size="xl" className="w-full" disabled={!serverOnline || busyLookup || !manualSerial.trim()} onClick={() => { setError(""); void lookup({ serial: manualSerial.trim().toUpperCase(), entryMethod: "MANUAL" }); }}>{busyLookup ? "Looking up…" : "Look up serial"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </form>;
}
