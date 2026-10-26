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
import { apiFetch, type ApiFailure } from "@/lib/api-client";
import type { EventDto } from "@/server/services/events.service";

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
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Event name" htmlFor="event-name" className="sm:col-span-2">
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
          <Field label="Venue" htmlFor="event-venue">
            <Input
              id="event-venue"
              required
              value={form.venue}
              onChange={(e) => set("venue", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Address (optional)" htmlFor="event-address">
            <Input
              id="event-address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Date" htmlFor="event-date">
            <Input
              id="event-date"
              type="date"
              required
              value={form.eventDate}
              onChange={(e) => set("eventDate", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Timezone" htmlFor="event-timezone">
            <Input
              id="event-timezone"
              required
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Start time (local)" htmlFor="event-start">
            <Input
              id="event-start"
              type="time"
              required
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="End time (local)" htmlFor="event-end">
            <Input
              id="event-end"
              type="time"
              required
              value={form.endTime}
              onChange={(e) => set("endTime", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Maximum capacity (tickets)" htmlFor="event-capacity">
            <Input
              id="event-capacity"
              type="number"
              min={1}
              step={1}
              required
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              disabled={saving}
            />
          </Field>
          {mode === "edit" ? (
            <Field label="Event status" htmlFor="event-status">
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
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Sales open" htmlFor="sales-opens">
            <Input
              id="sales-opens"
              type="datetime-local"
              value={form.salesOpensAtLocal}
              onChange={(e) => set("salesOpensAtLocal", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Sales close" htmlFor="sales-closes">
            <Input
              id="sales-closes"
              type="datetime-local"
              value={form.salesClosesAtLocal}
              onChange={(e) => set("salesClosesAtLocal", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Admission opens" htmlFor="admission-opens">
            <Input
              id="admission-opens"
              type="datetime-local"
              value={form.admissionOpensAtLocal}
              onChange={(e) => set("admissionOpensAtLocal", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Admission closes" htmlFor="admission-closes">
            <Input
              id="admission-closes"
              type="datetime-local"
              value={form.admissionClosesAtLocal}
              onChange={(e) => set("admissionClosesAtLocal", e.target.value)}
              disabled={saving}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding (optional)</CardTitle>
          <CardDescription>
            Shown on tickets and screens once printing is configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Accent colour (#rrggbb)" htmlFor="event-accent">
            <Input
              id="event-accent"
              placeholder="#16a34a"
              value={form.accentColor}
              onChange={(e) => set("accentColor", e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Organiser contact (optional)" htmlFor="event-contact">
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
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
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
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
