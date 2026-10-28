"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import type { TicketTypeDto } from "@/server/services/ticket-types.service";

interface TicketTypeManagerProps {
  eventId: string;
  canManage: boolean;
  /** Event remains editable (not completed/archived). */
  eventEditable: boolean;
  ticketTypes: TicketTypeDto[];
}

interface FormState {
  name: string;
  description: string;
  priceUgx: string;
  allocationLimit: string;
  salesOpensAtLocal: string;
  salesClosesAtLocal: string;
  permitsAdmission: boolean;
  status: "ACTIVE" | "INACTIVE";
  printLabel: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  priceUgx: "",
  allocationLimit: "",
  salesOpensAtLocal: "",
  salesClosesAtLocal: "",
  permitsAdmission: true,
  status: "ACTIVE",
  printLabel: "",
};

function fromDto(dto: TicketTypeDto): FormState {
  return {
    name: dto.name,
    description: dto.description ?? "",
    priceUgx: String(dto.priceUgx),
    allocationLimit: dto.allocationLimit === null ? "" : String(dto.allocationLimit),
    salesOpensAtLocal: dto.salesOpensAtLocal ?? "",
    salesClosesAtLocal: dto.salesClosesAtLocal ?? "",
    permitsAdmission: dto.permitsAdmission,
    status: dto.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    printLabel: dto.printLabel ?? "",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const optional = (value: string): string | null => (value === "" ? null : value);
  return {
    name: form.name,
    description: optional(form.description),
    priceUgx: Number(form.priceUgx),
    allocationLimit: form.allocationLimit === "" ? null : Number(form.allocationLimit),
    salesOpensAtLocal: optional(form.salesOpensAtLocal),
    salesClosesAtLocal: optional(form.salesClosesAtLocal),
    permitsAdmission: form.permitsAdmission,
    status: form.status,
    printLabel: optional(form.printLabel),
  };
}

export function TicketTypeManager({
  eventId,
  canManage,
  eventEditable,
  ticketTypes,
}: TicketTypeManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TicketTypeDto | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setOpen(true);
  }

  function openEdit(dto: TicketTypeDto) {
    setEditing(dto);
    setForm(fromDto(dto));
    setError(null);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result =
      editing === null
        ? await apiFetch<{ ticketType: TicketTypeDto }>(
            `/api/v1/events/${eventId}/ticket-types`,
            { method: "POST", body: JSON.stringify(toPayload(form)) },
          )
        : await apiFetch<{ ticketType: TicketTypeDto }>(
            `/api/v1/ticket-types/${editing.id}`,
            { method: "PATCH", body: JSON.stringify(toPayload(form)) },
          );

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    toast.success(editing === null ? "Ticket category added." : "Ticket category saved.");
    setOpen(false);
    setSaving(false);
    router.refresh();
  }

  const editable = canManage && eventEditable;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Ticket categories</CardTitle>
            <CardDescription>
              Prices are integer UGX. Quantities together may never exceed event
              capacity.
            </CardDescription>
          </div>
          {editable ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <Button size="sm" onClick={openCreate}>
                    <Plus /> Add category
                  </Button>
                }
              />
              <DialogContent className="top-auto bottom-0 left-0 max-h-[90dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
                <DialogHeader>
                  <DialogTitle>
                    {editing === null ? "Add ticket category" : "Edit ticket category"}
                  </DialogTitle>
                  <DialogDescription>
                    {editing === null
                      ? "New category for this event."
                      : `Editing “${editing.name}”.`}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
                  <FormAlert error={error} />
                  <details open className="rounded-lg border p-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">Basics</summary>
                    <div className="grid gap-3 pt-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="tt-name">Name</Label>
                    <Input
                      id="tt-name"
                      required
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      disabled={saving}
                    />
                    <FieldError error={error} field="name" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="tt-description">Description (optional)</Label>
                    <Textarea
                      id="tt-description"
                      rows={2}
                      value={form.description}
                      onChange={(e) => set("description", e.target.value)}
                      disabled={saving}
                    />
                    <FieldError error={error} field="description" />
                  </div>
                    </div>
                  </details>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <details open className="sm:col-span-2 rounded-lg border p-3">
                      <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">Pricing and quantity policy</summary>
                      <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="tt-price">Price (UGX)</Label>
                      <Input
                        id="tt-price"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        required
                        value={form.priceUgx}
                        onChange={(e) => set("priceUgx", e.target.value)}
                        disabled={saving}
                      />
                      <FieldError error={error} field="priceUgx" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="tt-allocation">Quantity limit (optional)</Label>
                      <Input
                        id="tt-allocation"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        placeholder="No limit"
                        value={form.allocationLimit}
                        onChange={(e) => set("allocationLimit", e.target.value)}
                        disabled={saving}
                      />
                      <FieldError error={error} field="allocationLimit" />
                    </div>
                      </div>
                    </details>
                    <details open className="sm:col-span-2 rounded-lg border p-3">
                      <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">Sales window</summary>
                      <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="tt-sales-opens">Sales start (optional)</Label>
                      <Input
                        id="tt-sales-opens"
                        type="datetime-local"
                        value={form.salesOpensAtLocal}
                        onChange={(e) => set("salesOpensAtLocal", e.target.value)}
                        disabled={saving}
                      />
                      <FieldError error={error} field="salesOpensAtLocal" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="tt-sales-closes">Sales end (optional)</Label>
                      <Input
                        id="tt-sales-closes"
                        type="datetime-local"
                        value={form.salesClosesAtLocal}
                        onChange={(e) => set("salesClosesAtLocal", e.target.value)}
                        disabled={saving}
                      />
                      <FieldError error={error} field="salesClosesAtLocal" />
                    </div>
                      </div>
                    </details>
                    <details open className="sm:col-span-2 rounded-lg border p-3">
                      <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">Admission and ticket presentation</summary>
                      <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label>Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          set("status", value as FormState["status"])
                        }
                      >
                        <SelectTrigger className="w-full" disabled={saving}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="INACTIVE">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="tt-print-label">Print label (optional)</Label>
                      <Input
                        id="tt-print-label"
                        value={form.printLabel}
                        onChange={(e) => set("printLabel", e.target.value)}
                        disabled={saving}
                      />
                    </div>
                      </div>
                      <label className="mt-3 flex min-h-11 items-center gap-3 text-base">
                        <input type="checkbox" checked={form.permitsAdmission} onChange={(e) => set("permitsAdmission", e.target.checked)} disabled={saving} className="size-4" />
                        This category permits admission
                      </label>
                    </details>
                  </div>
                  <DialogFooter className="sticky bottom-0 gap-2 border-t bg-popover pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                      <Button type="submit" className="min-h-12" disabled={saving}>
                      {saving ? <Loader2 className="animate-spin" /> : null}
                      {saving ? "Saving…" : editing === null ? "Add category" : "Save"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {ticketTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {editable
              ? "No ticket categories yet. Add one to start defining prices."
              : "No ticket categories configured yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Price</th>
                  <th className="py-2 pr-3 font-medium">Limit</th>
                  <th className="py-2 pr-3 font-medium">Sales window</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {ticketTypes.map((type) => (
                  <tr key={type.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{type.name}</p>
                      {type.description ? (
                        <p className="text-xs text-muted-foreground">
                          {type.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {type.priceUgx.toLocaleString("en-UG")} UGX
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {type.allocationLimit === null ? "—" : type.allocationLimit}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {type.salesOpensAtLocal && type.salesClosesAtLocal
                        ? `${type.salesOpensAtLocal} → ${type.salesClosesAtLocal}`
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          variant="outline"
                          className={
                            type.status === "ACTIVE"
                              ? "border-transparent bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                              : "border-border bg-muted text-muted-foreground"
                          }
                        >
                          {type.status === "ACTIVE" ? "Active" : "Inactive"}
                        </Badge>
                        {!type.permitsAdmission ? (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted text-muted-foreground"
                          >
                            No admission
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      {editable ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${type.name}`}
                          onClick={() => openEdit(type)}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
