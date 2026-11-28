"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/reui/number-field";
import { PhoneInput } from "@/components/reui/phone-input";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { formatUGX } from "@/components/ui/money";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { EventDto } from "@/server/services/events.service";
import type { TicketTypeDto } from "@/server/services/ticket-types.service";

interface Props {
  events: EventDto[];
  initialEventId?: string;
  initialTypes: TicketTypeDto[];
  canDiscount: boolean;
}

const STEPS = ["Customer", "Tickets", "Review", "Payment", "Confirm"] as const;

export function SaleCreateForm({
  events,
  initialEventId,
  initialTypes,
  canDiscount,
}: Props) {
  const router = useRouter();
  const [stepNum, setStepNum] = useState(1);
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
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const subtotal = useMemo(
    () =>
      ticketTypes.reduce(
        (sum, type) => sum + (quantities[type.id] ?? 0) * type.priceUgx,
        0,
      ),
    [ticketTypes, quantities],
  );
  const discount = Number(discountUgx) || 0;
  const total = Math.max(0, subtotal - discount);
  const paid = Number(paymentAmount) || 0;
  const balance = Math.max(0, total - paid);
  const activeTypes = ticketTypes.filter((type) => type.status === "ACTIVE");
  const currentStepLabel = STEPS[stepNum - 1] ?? "Customer";

  async function changeEvent(id: string) {
    setEventId(id);
    setQuantities({});
    setTicketTypes([]);
    setError("");
    setFieldErrors({});
    if (!id) return;
    try {
      const response = await fetch(`/api/v1/events/${encodeURIComponent(id)}/ticket-types`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error?.message ?? "Could not load ticket categories.");
        return;
      }
      setTicketTypes(data.ticketTypes ?? []);
    } catch {
      setError("Could not load ticket categories. Check your connection and retry.");
    }
  }

  function setQuantity(typeId: string, value: number) {
    setQuantities((current) => ({
      ...current,
      [typeId]: Math.max(0, Math.min(500, Math.trunc(value) || 0)),
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    const items = activeTypes
      .filter((type) => (quantities[type.id] ?? 0) > 0)
      .map((type) => ({ ticketTypeId: type.id, quantity: quantities[type.id] }));
    const amount = paymentAmount === "" ? undefined : Number(paymentAmount);
    const body = {
      eventId,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      notes: notes || undefined,
      items,
      ...(discount ? { discountUgx: discount, discountReason } : {}),
      ...(amount === undefined
        ? {}
        : {
            initialPayment: {
              amountUgx: amount,
              method: paymentMethod,
              externalRef: externalRef || undefined,
            },
          }),
    };
    try {
      const response = await fetch("/api/v1/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error?.message ?? "Sale could not be confirmed.");
        if (Array.isArray(data.error?.details)) {
          setFieldErrors(
            Object.fromEntries(
              data.error.details.map((detail: { path: string; message: string }) => [
                detail.path,
                detail.message,
              ]),
            ),
          );
        }
        setBusy(false);
        return;
      }
      router.push(`/sales/${data.sale.id}`);
    } catch {
      setError("Connection failed. Retry to safely submit this sale.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Frame spacing="default">
        <FramePanel>
          <Stepper
            value={stepNum}
            onValueChange={(next) => {
              setError("");
              setStepNum(next);
            }}
            indicators={{
              completed: <CheckIcon className="size-3.5" aria-hidden="true" />,
            }}
          >
            <StepperNav className="gap-2">
              {STEPS.map((name, index) => {
                const step = index + 1;
                const disabled =
                  (step > 1 && !eventId) || (step > 2 && subtotal <= 0);
                return (
                  <StepperItem
                    key={name}
                    step={step}
                    completed={step < stepNum}
                    disabled={disabled}
                  >
                    <StepperTrigger className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
                      <StepperIndicator>{step}</StepperIndicator>
                      <StepperTitle className="hidden text-xs sm:inline">
                        {name}
                      </StepperTitle>
                    </StepperTrigger>
                    {index < STEPS.length - 1 ? <StepperSeparator /> : null}
                  </StepperItem>
                );
              })}
            </StepperNav>
          </Stepper>
          <p className="text-muted-foreground mt-2 text-center text-xs sm:hidden">
            Step {stepNum} of {STEPS.length}: {currentStepLabel}
          </p>
        </FramePanel>
      </Frame>

      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Could not continue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Frame spacing="default">
        <FrameHeader>
          <FrameTitle>
            {stepNum === 1
              ? "Customer & event"
              : stepNum === 2
                ? "Choose tickets"
                : stepNum === 3
                  ? "Review sale"
                  : stepNum === 4
                    ? "Record payment"
                    : "Confirm sale"}
          </FrameTitle>
          <FrameDescription>
            {stepNum === 1
              ? "Select the event and optional buyer details."
              : stepNum === 2
                ? "Set ticket quantities for this order."
                : stepNum === 3
                  ? "Verify line items and customer details."
                  : stepNum === 4
                    ? "Only record funds staff have confirmed as received."
                    : "The server recalculates prices, checks inventory, and records the sale."}
          </FrameDescription>
        </FrameHeader>

        <FramePanel className="flex flex-col gap-4">
          {stepNum === 1 ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sale-event">Event</Label>
                <NativeSelect
                  id="sale-event"
                  required
                  value={eventId}
                  onChange={(e) => void changeEvent(e.target.value)}
                  className="w-full"
                >
                  <NativeSelectOption value="">Select an event</NativeSelectOption>
                  {events.map((event) => (
                    <NativeSelectOption key={event.id} value={event.id}>
                      {event.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {fieldErrors.eventId ? (
                  <p className="text-destructive text-xs">{fieldErrors.eventId}</p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sale-customer-name">Customer name (optional)</Label>
                  <Input
                    id="sale-customer-name"
                    autoComplete="name"
                    maxLength={120}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                  {fieldErrors.customerName ? (
                    <p className="text-destructive text-xs">{fieldErrors.customerName}</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sale-customer-phone">Phone (optional)</Label>
                  <PhoneInput
                    id="sale-customer-phone"
                    defaultCountry="UG"
                    placeholder="772 000 000"
                    value={customerPhone}
                    onChange={(val) => setCustomerPhone(val ?? "")}
                  />
                  {fieldErrors.customerPhone ? (
                    <p className="text-destructive text-xs">{fieldErrors.customerPhone}</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {stepNum === 2 ? (
            <>
              {activeTypes.length > 0 ? (
                <div className="divide-y">
                  {activeTypes.map((type) => {
                    const quantity = quantities[type.id] ?? 0;
                    return (
                      <div
                        key={type.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{type.name}</p>
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {formatUGX(type.priceUgx)} each
                          </p>
                        </div>
                        <div className="w-36 shrink-0">
                          <NumberField
                            min={0}
                            max={500}
                            value={quantity}
                            onValueChange={(val) => setQuantity(type.id, val ?? 0)}
                          >
                            <NumberFieldGroup>
                              <NumberFieldDecrement aria-label={`Remove one ${type.name}`} />
                              <NumberFieldInput aria-label={`${type.name} quantity`} />
                              <NumberFieldIncrement aria-label={`Add one ${type.name}`} />
                            </NumberFieldGroup>
                          </NumberField>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Select an event with active ticket categories.
                </p>
              )}

              {canDiscount ? (
                <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sale-discount">Administrator discount</Label>
                    <InputGroup>
                      <InputGroupAddon>UGX</InputGroupAddon>
                      <InputGroupInput
                        id="sale-discount"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={subtotal}
                        step={1}
                        value={discountUgx}
                        onChange={(e) => setDiscountUgx(e.target.value)}
                      />
                    </InputGroup>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sale-discount-reason">Reason (required with discount)</Label>
                    <Input
                      id="sale-discount-reason"
                      maxLength={500}
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {stepNum === 3 ? (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium">Event</span>
                <span className="text-sm font-medium">
                  {events.find((event) => event.id === eventId)?.name}
                </span>
              </div>

              <div className="divide-y border-y">
                {activeTypes
                  .filter((type) => quantities[type.id])
                  .map((type) => (
                    <div key={type.id} className="flex justify-between gap-3 py-2 text-sm">
                      <span>
                        {quantities[type.id]} × {type.name}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatUGX(quantities[type.id] * type.priceUgx)}
                      </span>
                    </div>
                  ))}
              </div>

              {discount > 0 ? (
                <p className="text-muted-foreground text-sm">
                  Discount: −{formatUGX(discount)} · {discountReason}
                </p>
              ) : null}

              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium">Customer</span>
                <span className="text-sm font-medium">
                  {customerName || "Not provided"}
                  {customerPhone ? ` · ${customerPhone}` : ""}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sale-notes">Notes (optional)</Label>
                <Input
                  id="sale-notes"
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                {fieldErrors.notes ? (
                  <p className="text-destructive text-xs">{fieldErrors.notes}</p>
                ) : null}
              </div>
            </>
          ) : null}

          {stepNum === 4 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sale-pay-amount">Amount received (optional)</Label>
                <InputGroup>
                  <InputGroupAddon>UGX</InputGroupAddon>
                  <InputGroupInput
                    id="sale-pay-amount"
                    inputMode="numeric"
                    type="number"
                    min={1}
                    step={1}
                    max={2_000_000_000}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </InputGroup>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sale-pay-method">Method</Label>
                <NativeSelect
                  id="sale-pay-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full"
                >
                  <NativeSelectOption value="CASH">Cash</NativeSelectOption>
                  <NativeSelectOption value="MOBILE_MONEY">Mobile money</NativeSelectOption>
                  <NativeSelectOption value="BANK_TRANSFER">Bank transfer</NativeSelectOption>
                  <NativeSelectOption value="CARD">Card</NativeSelectOption>
                  <NativeSelectOption value="OTHER">Other</NativeSelectOption>
                </NativeSelect>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sale-pay-ref">Transaction reference (optional)</Label>
                <Input
                  id="sale-pay-ref"
                  maxLength={120}
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {stepNum === 5 ? (
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-mono font-semibold tabular-nums">{formatUGX(total)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Recorded payment</dt>
                <dd className="font-mono tabular-nums">{formatUGX(paid)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                <dt>Balance due</dt>
                <dd className="font-mono tabular-nums">{formatUGX(balance)}</dd>
              </div>
            </dl>
          ) : null}
        </FramePanel>

        <FrameFooter>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span>
                Total <strong className="font-mono tabular-nums">{formatUGX(total)}</strong>
              </span>
              <span className="text-muted-foreground">
                Balance <strong className="text-foreground font-mono tabular-nums">{formatUGX(balance)}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {stepNum > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError("");
                    setStepNum((s) => Math.max(1, s - 1));
                  }}
                >
                  <ArrowLeftIcon aria-hidden="true" />
                  Back
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
              )}

              {stepNum === STEPS.length ? (
                <Button type="submit" disabled={busy || subtotal <= 0}>
                  {busy ? <Spinner /> : null}
                  {busy ? "Confirming…" : "Confirm sale"}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={(stepNum === 1 && !eventId) || (stepNum === 2 && subtotal <= 0)}
                  onClick={() => {
                    setError("");
                    setStepNum((s) => Math.min(STEPS.length, s + 1));
                  }}
                >
                  Continue
                  <ArrowRightIcon aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </FrameFooter>
      </Frame>
    </form>
  );
}
