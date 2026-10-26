"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormAlert } from "@/components/layout/form-alert";
import { apiFetch, type ApiFailure } from "@/lib/api-client";
import { SERIAL_PREFIX_DEFAULT } from "@/lib/serial";

const ALL = "ALL";

interface EventOption {
  id: string;
  name: string;
  status: string;
}

interface TicketTypeOption {
  id: string;
  name: string;
  status: string;
}

interface BatchFormProps {
  events: EventOption[];
}

interface GeneratedBatch {
  id: string;
  batchRef: string;
  quantity: number;
  serialRange: string;
}

function padSerial(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

/**
 * Ticket generation (PRD 5.5): fill in the batch, review a summary, then
 * commit. The Idempotency-Key is minted per review session so a network
 * retry cannot create a second batch (business rule 8).
 */
export function BatchForm({ events }: BatchFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "review">("form");
  const [error, setError] = useState<ApiFailure | null>(null);

  const [eventId, setEventId] = useState(ALL);
  const [ticketTypeId, setTicketTypeId] = useState(ALL);
  const [quantity, setQuantity] = useState("500");
  const [serialPrefix, setSerialPrefix] = useState(SERIAL_PREFIX_DEFAULT);
  const [serialStart, setSerialStart] = useState("");
  const [label, setLabel] = useState("");

  const [types, setTypes] = useState<TicketTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const selectedEvent = events.find((event) => event.id === eventId);
  const selectedType = types.find((type) => type.id === ticketTypeId);
  const quantityNumber = Number.parseInt(quantity, 10);

  async function onEventChange(value: string) {
    setEventId(value);
    setTicketTypeId(ALL);
    setTypes([]);
    if (value === ALL) return;
    setLoadingTypes(true);
    const result = await apiFetch<{ ticketTypes: TicketTypeOption[] }>(
      `/api/v1/events/${value}/ticket-types`,
    );
    setTypes(result.ok ? result.data.ticketTypes : []);
    setLoadingTypes(false);
  }

  function startReview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (eventId === ALL || ticketTypeId === ALL) {
      setError({
        code: "VALIDATION_ERROR",
        message: "Choose an event and a ticket category.",
      });
      return;
    }
    if (!Number.isInteger(quantityNumber) || quantityNumber < 1) {
      setError({
        code: "VALIDATION_ERROR",
        message: "Quantity must be a whole number of at least 1.",
      });
      return;
    }
    if (serialPrefix.trim() === "") {
      setError({ code: "VALIDATION_ERROR", message: "Enter a serial prefix." });
      return;
    }
    setIdempotencyKey(crypto.randomUUID());
    setStep("review");
  }

  async function confirm() {
    if (!idempotencyKey) return;
    setSaving(true);
    setError(null);

    const result = await apiFetch<{ batch: GeneratedBatch }>("/api/v1/ticket-batches", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        eventId,
        ticketTypeId,
        quantity: quantityNumber,
        serialPrefix: serialPrefix.trim().toUpperCase(),
        ...(serialStart.trim() === ""
          ? {}
          : { serialStart: Number.parseInt(serialStart, 10) }),
        ...(label.trim() === "" ? {} : { label: label.trim() }),
      }),
    });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    toast.success(
      `Batch ${result.data.batch.batchRef} created — ${result.data.batch.quantity} tickets.`,
    );
    router.push(`/tickets/batches/${result.data.batch.id}`);
    router.refresh();
  }

  if (step === "review") {
    const startNumber = Number.parseInt(serialStart, 10);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Confirm batch generation</CardTitle>
          <CardDescription>
            Review carefully. Serial numbers are allocated permanently and this
            action is recorded in the audit log. If the database rejects any
            part of the batch, nothing is created.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Event</dt>
              <dd className="font-medium">{selectedEvent?.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Category</dt>
              <dd className="font-medium">{selectedType?.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Quantity</dt>
              <dd className="font-medium tabular-nums">{quantityNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Serial range</dt>
              <dd className="font-mono font-medium">
                {Number.isInteger(startNumber) && serialStart.trim() !== ""
                  ? `${padSerial(serialPrefix.trim().toUpperCase(), startNumber)} … ${padSerial(
                      serialPrefix.trim().toUpperCase(),
                      startNumber + quantityNumber - 1,
                    )}`
                  : `${serialPrefix.trim().toUpperCase()}-… (next free numbers)`}
              </dd>
            </div>
            {label.trim() !== "" ? (
              <div>
                <dt className="text-xs text-muted-foreground">Label</dt>
                <dd className="font-medium">{label.trim()}</dd>
              </div>
            ) : null}
          </dl>

          <FormAlert error={error} />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                setStep("form");
                setError(null);
              }}
            >
              <ArrowLeft /> Back to edit
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void confirm()}>
              {saving ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              Generate {quantityNumber} tickets
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New ticket batch</CardTitle>
        <CardDescription>
          Tickets are generated transactionally with unique serials and secure
          QR tokens. Nothing is created until you confirm the summary.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={startReview} className="flex flex-col gap-4" noValidate>
          <FormAlert error={error} />

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Event</span>
            <Select
              value={eventId}
              onValueChange={(value) => {
                if (value) void onEventChange(value);
              }}
            >
              <SelectTrigger className="w-full" disabled={saving}>
                <SelectValue placeholder="Choose an event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Category</span>
            <Select
              value={ticketTypeId}
              onValueChange={(value) => setTicketTypeId(value ?? ALL)}
              disabled={saving || eventId === ALL || loadingTypes}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    eventId === ALL
                      ? "Choose an event first"
                      : loadingTypes
                        ? "Loading categories…"
                        : "Choose a category"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {types
                  .filter((type) => type.status === "ACTIVE")
                  .map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={10000}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="serial-prefix">Serial prefix</Label>
              <Input
                id="serial-prefix"
                value={serialPrefix}
                onChange={(e) => setSerialPrefix(e.target.value.toUpperCase())}
                maxLength={12}
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="serial-start">Starting number</Label>
              <Input
                id="serial-start"
                type="number"
                min={0}
                placeholder="Automatic"
                value={serialStart}
                onChange={(e) => setSerialStart(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="batch-label">Label (optional)</Label>
            <Input
              id="batch-label"
              placeholder="e.g. Phase-one stock for gate A"
              maxLength={100}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Button type="submit" size="sm" disabled={saving}>
              Review batch <ArrowRight />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
