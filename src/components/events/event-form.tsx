"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/layout/form-alert";
import { FieldError } from "@/components/layout/field-error";
import { apiFetch, type ApiFailure } from "@/lib/api-client";
import type { EventDto } from "@/server/services/events.service";
import { BrandingManager } from "@/components/events/branding-manager";

interface EventFormProps {
  mode: "create" | "edit";
  event?: EventDto;
}

interface FormState {
  name: string;
  description: string;
  venue: string;
  address: string;
  timezone: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  capacity: string;
  salesOpensAtLocal: string;
  salesClosesAtLocal: string;
  admissionOpensAtLocal: string;
  admissionClosesAtLocal: string;
  accentColor: string;
  ticketFooterText: string;
  organiserContact: string;
  status: "DRAFT" | "SCHEDULED";
}

function initialState(event?: EventDto): FormState {
  return {
    name: event?.name ?? "",
    description: event?.description ?? "",
    venue: event?.venue ?? "",
    address: event?.address ?? "",
    timezone: event?.timezone ?? "Africa/Kampala",
    eventDate: event?.eventDate ?? "",
    startTime: event?.startTime ?? "",
    endTime: event?.endTime ?? "",
    capacity: event ? String(event.capacity) : "",
    salesOpensAtLocal: event?.salesOpensAtLocal ?? "",
    salesClosesAtLocal: event?.salesClosesAtLocal ?? "",
    admissionOpensAtLocal: event?.admissionOpensAtLocal ?? "",
    admissionClosesAtLocal: event?.admissionClosesAtLocal ?? "",
    accentColor: event?.accentColor ?? "",
    ticketFooterText: event?.ticketFooterText ?? "",
    organiserContact: event?.organiserContact ?? "",
    status: event?.status === "SCHEDULED" ? "SCHEDULED" : "DRAFT",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const optional = (value: string): string | null => (value === "" ? null : value);
  return {
    name: form.name,
    description: optional(form.description),
    venue: form.venue,
    address: optional(form.address),
    timezone: form.timezone,
    eventDate: form.eventDate,
    startTime: form.startTime,
    endTime: form.endTime,
    capacity: Number(form.capacity),
    salesOpensAtLocal: optional(form.salesOpensAtLocal),
    salesClosesAtLocal: optional(form.salesClosesAtLocal),
    admissionOpensAtLocal: optional(form.admissionOpensAtLocal),
    admissionClosesAtLocal: optional(form.admissionClosesAtLocal),
    accentColor: optional(form.accentColor),
    ticketFooterText: optional(form.ticketFooterText),
    organiserContact: optional(form.organiserContact),
    status: form.status,
  };
}

export function EventForm({ mode, event }: EventFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(event));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result =
      mode === "create"
        ? await apiFetch<{ event: EventDto }>("/api/v1/events", {
            method: "POST",
            body: JSON.stringify(toPayload(form)),
          })
        : await apiFetch<{ event: EventDto }>(`/api/v1/events/${event?.id}`, {
            method: "PATCH",
            body: JSON.stringify(toPayload(form)),
          });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    if (mode === "create") {
      toast.success("Event created.");
      router.push(`/events/${result.data.event.id}`);
      router.refresh();
    } else {
      toast.success("Event saved.");
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert error={error} />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Name, venue and schedule.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <details open className="rounded-lg border border-border p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">Basics</summary>
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <Field label="Event name" htmlFor="event-name" error={error} className="sm:col-span-2">
            <Input
              id="event-name"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field
            label="Description (optional)"
            htmlFor="event-description"
            error={error}
            className="sm:col-span-2"
          >
            <Textarea
              id="event-description"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Venue" htmlFor="event-venue" error={error}>
            <Input
              id="event-venue"
              required
              value={form.venue}
              onChange={(e) => set("venue", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Address (optional)" htmlFor="event-address" error={error}>
            <Input
              id="event-address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              disabled={saving}
            />
          </Field>
            </div>
          </details>
          <details open className="rounded-lg border border-border p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">Dates, times and capacity</summary>
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <Field label="Date" htmlFor="event-date" error={error}>
            <Input
              id="event-date"
              type="date"
              required
              value={form.eventDate}
              onChange={(e) => set("eventDate", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Timezone" htmlFor="event-timezone" error={error}>
            <Input
              id="event-timezone"
              required
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Start time (local)" htmlFor="event-start" error={error}>
            <Input
              id="event-start"
              type="time"
              required
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="End time (local)" htmlFor="event-end" error={error}>
            <Input
              id="event-end"
              type="time"
              required
              value={form.endTime}
              onChange={(e) => set("endTime", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Maximum capacity (tickets)" htmlFor="event-capacity" error={error}>
            <Input
              id="event-capacity"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              disabled={saving}
            />
          </Field>
          {mode === "edit" ? (
            <Field label="Event status" htmlFor="event-status" error={error}>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  set("status", value as FormState["status"])
                }
              >
                <SelectTrigger id="event-status" className="w-full" disabled={saving}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sales and admission windows</CardTitle>
          <CardDescription>
            Times are local to the event timezone. Leave blank for no fixed
            window — sales and admission still require explicit opening.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details open className="rounded-lg border border-border p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">Sales and admission windows</summary>
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <Field label="Sales open" htmlFor="sales-opens" error={error}>
            <Input
              id="sales-opens"
              type="datetime-local"
              value={form.salesOpensAtLocal}
              onChange={(e) => set("salesOpensAtLocal", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Sales close" htmlFor="sales-closes" error={error}>
            <Input
              id="sales-closes"
              type="datetime-local"
              value={form.salesClosesAtLocal}
              onChange={(e) => set("salesClosesAtLocal", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Admission opens" htmlFor="admission-opens" error={error}>
            <Input
              id="admission-opens"
              type="datetime-local"
              value={form.admissionOpensAtLocal}
              onChange={(e) => set("admissionOpensAtLocal", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Admission closes" htmlFor="admission-closes" error={error}>
            <Input
              id="admission-closes"
              type="datetime-local"
              value={form.admissionClosesAtLocal}
              onChange={(e) => set("admissionClosesAtLocal", e.target.value)}
              disabled={saving}
            />
          </Field>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding (optional)</CardTitle>
          <CardDescription>
            Shown on tickets and screens once printing is configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details className="rounded-lg border border-border p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">Branding and organiser contact</summary>
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <Field label="Accent colour (#rrggbb)" htmlFor="event-accent" error={error}>
            <Input
              id="event-accent"
              placeholder="#16a34a"
              value={form.accentColor}
              onChange={(e) => set("accentColor", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Organiser contact (optional)" htmlFor="event-contact" error={error}>
            <Input
              id="event-contact"
              value={form.organiserContact}
              onChange={(e) => set("organiserContact", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field
            label="Ticket footer text (optional)"
            htmlFor="event-footer"
            error={error}
            className="sm:col-span-2"
          >
            <Textarea
              id="event-footer"
              rows={2}
              value={form.ticketFooterText}
              onChange={(e) => set("ticketFooterText", e.target.value)}
              disabled={saving}
            />
          </Field>
            </div>
          </details>
        </CardContent>
      </Card>

      {mode === "edit" && event ? (
        <BrandingManager eventId={event.id} initialAssets={event.branding} />
      ) : (
        <Card>
          <CardHeader><CardTitle>Event poster and logo</CardTitle><CardDescription>JPEG, PNG or WebP images up to 5 MB, with required alt text.</CardDescription></CardHeader>
          <CardContent><p className="text-base text-muted-foreground">Save the event first. You can then upload its poster and optional logo from the event details page.</p></CardContent>
        </Card>
      )}

      <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-xl border bg-background/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur md:bottom-0">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving
            ? "Saving…"
            : mode === "create"
              ? "Create event"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
  className,
  error,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
  error: ApiFailure | null;
}) {
  const errorFields: Record<string, string> = { "event-name": "name", "event-description": "description", "event-venue": "venue", "event-address": "address", "event-date": "eventDate", "event-timezone": "timezone", "event-start": "startTime", "event-end": "endTime", "event-capacity": "capacity", "event-status": "status", "sales-opens": "salesOpensAtLocal", "sales-closes": "salesClosesAtLocal", "admission-opens": "admissionOpensAtLocal", "admission-closes": "admissionClosesAtLocal", "event-accent": "accentColor", "event-contact": "organiserContact", "event-footer": "ticketFooterText" };
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      <FieldError error={error} field={errorFields[htmlFor] ?? htmlFor} />
    </div>
  );
}
