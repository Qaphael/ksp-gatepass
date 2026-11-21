"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatUGX } from "@/components/ui/money";
import { apiFetch, type ApiFailure } from "@/lib/api-client";
import type { TicketTypeDto } from "@/server/services/ticket-types.service";

/** Sold/remaining counts per category, from `getTicketTypeProgress`. Display only. */
export interface TicketTypeProgress {
  id: string;
  sold: number;
  remaining: number;
  total: number;
}

interface TicketTypeManagerProps {
  eventId: string;
  canManage: boolean;
  /** Event remains editable (not completed/archived). */
  eventEditable: boolean;
  ticketTypes: TicketTypeDto[];
  progress?: TicketTypeProgress[];
}

interface FormState {
  name: string;
  color: string;
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
  color: "#0F3D2E",
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
    color: dto.color,
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
    color: form.color,
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
  progress = [],
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
  const progressById = new Map(progress.map((row) => [row.id, row]));

  return (
    <section aria-labelledby="ticket-tiers-heading" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ticket-tiers-heading" className="text-lg font-semibold">Ticket tiers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prices are integer UGX. Quantities together may never exceed event capacity. An
            earlier closing time on the same date is treated as the following morning.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {ticketTypes.length} {ticketTypes.length === 1 ? "category" : "categories"}
          </span>
          {editable ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <Button size="sm" onClick={openCreate}>
                    <Plus /> Add category
                  </Button>
                }
              />
              <DialogContent className="top-auto bottom-0 left-0 max-h-[90dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-lg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:w-[calc(100%-3rem)] md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg">
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
                <form onSubmit={onSubmit} className="grid gap-5" noValidate>
                  <FormAlert error={error} />
                  <section className="grid gap-4">
                    <h3 className="text-base font-semibold">Category details</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="tt-name">Name</Label>
                        <Input id="tt-name" required value={form.name} onChange={(e) => set("name", e.target.value)} disabled={saving} />
                        <FieldError error={error} field="name" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="tt-color">Category color</Label>
                        <div className="flex items-center gap-3">
                          <Input id="tt-color" type="color" className="h-12 w-16 p-1" value={form.color} onChange={(e) => set("color", e.target.value)} disabled={saving} />
                          <span className="font-mono text-sm">{form.color}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Used behind configured ticket stub text.</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:col-span-2">
                        <Label htmlFor="tt-description">Description (optional)</Label>
                        <Textarea id="tt-description" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} disabled={saving} />
                        <FieldError error={error} field="description" />
                      </div>
                    </div>
                  </section>
                  <section className="grid gap-4 border-t border-border/70 pt-4">
                    <h3 className="text-base font-semibold">Pricing and quantity policy</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2"><Label htmlFor="tt-price">Price (UGX)</Label><Input id="tt-price" type="number" inputMode="numeric" min={0} step={1} required value={form.priceUgx} onChange={(e) => set("priceUgx", e.target.value)} disabled={saving} /><FieldError error={error} field="priceUgx" /></div>
                      <div className="flex flex-col gap-2"><Label htmlFor="tt-allocation">Quantity limit (optional)</Label><Input id="tt-allocation" type="number" inputMode="numeric" min={1} step={1} placeholder="No limit" value={form.allocationLimit} onChange={(e) => set("allocationLimit", e.target.value)} disabled={saving} /><FieldError error={error} field="allocationLimit" /></div>
                    </div>
                  </section>
                  <section className="grid gap-4 border-t border-border/70 pt-4">
                    <h3 className="text-base font-semibold">Sales window</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2"><Label htmlFor="tt-sales-opens">Sales start (optional)</Label><Input id="tt-sales-opens" type="datetime-local" value={form.salesOpensAtLocal} onChange={(e) => set("salesOpensAtLocal", e.target.value)} disabled={saving} /><FieldError error={error} field="salesOpensAtLocal" /></div>
                      <div className="flex flex-col gap-2"><Label htmlFor="tt-sales-closes">Sales end (optional)</Label><Input id="tt-sales-closes" type="datetime-local" value={form.salesClosesAtLocal} onChange={(e) => set("salesClosesAtLocal", e.target.value)} disabled={saving} /><FieldError error={error} field="salesClosesAtLocal" /></div>
                    </div>
                  </section>
                  <section className="grid gap-4 border-t border-border/70 pt-4">
                    <h3 className="text-base font-semibold">Admission and ticket presentation</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(value) => set("status", value as FormState["status"])}><SelectTrigger className="w-full" disabled={saving}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="INACTIVE">Inactive</SelectItem></SelectContent></Select></div>
                      <div className="flex flex-col gap-2"><Label htmlFor="tt-print-label">Print label (optional)</Label><Input id="tt-print-label" value={form.printLabel} onChange={(e) => set("printLabel", e.target.value)} disabled={saving} /></div>
                    </div>
                    <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border/70 bg-muted/40 px-3 text-base"><input type="checkbox" checked={form.permitsAdmission} onChange={(e) => set("permitsAdmission", e.target.checked)} disabled={saving} className="size-4 accent-primary" />This category permits admission</label>
                  </section>
                  <DialogFooter className="sticky bottom-0 gap-2 border-t bg-popover pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setOpen(false)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="min-h-12 w-full sm:w-auto" disabled={saving}>
                      {saving ? <Loader2 className="animate-spin" /> : null}
                      {saving ? "Saving…" : editing === null ? "Add category" : "Save"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {ticketTypes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="text-base text-muted-foreground">
            {editable
              ? "No ticket categories yet. Add one to start defining prices."
              : "No ticket categories configured yet."}
          </p>
        </div>
      ) : (
        <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
          {ticketTypes.map((type) => {
            const row = progressById.get(type.id);
            const sold = row?.sold ?? 0;
            const total = row?.total ?? type.allocationLimit ?? 0;
            const remaining = row?.remaining ?? Math.max(0, total - sold);
            const percent = total > 0 ? Math.min(100, Math.round((sold / total) * 100)) : 0;
            const soldOut = total > 0 && remaining === 0;
            const salesWindow = type.salesOpensAtLocal && type.salesClosesAtLocal
              ? `${type.salesOpensAtLocal} → ${type.salesClosesAtLocal}`
              : null;
            return (
              <li key={type.id} className="min-w-0">
                <article className="flex h-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border border-border" style={{ backgroundColor: type.color }} />
                        <h3 className="min-w-0 truncate text-base font-semibold">{type.name}</h3>
                        {type.status !== "ACTIVE" ? (
                          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">Inactive</Badge>
                        ) : null}
                        {soldOut ? (
                          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">Sold out</Badge>
                        ) : null}
                        {!type.permitsAdmission ? (
                          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">No admission</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 font-mono text-base font-semibold tabular-nums">{formatUGX(type.priceUgx)}</p>
                      {type.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{type.description}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right font-mono text-xs">
                      <p className="text-foreground tabular-nums">{sold} sold</p>
                      <p className="text-muted-foreground tabular-nums">{remaining} left</p>
                    </div>
                  </div>

                  <div>
                    <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                      {percent}% allocated
                      {type.allocationLimit !== null ? ` · limit ${type.allocationLimit}` : " · no limit set"}
                    </p>
                  </div>

                  {salesWindow ? (
                    <p className="font-mono text-[11px] text-muted-foreground">Sales {salesWindow}</p>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {editable ? (
                      <Button variant="outline" size="sm" aria-label={`Edit ${type.name}`} onClick={() => openEdit(type)}>
                        <Pencil /> Edit tier
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/tickets?eventId=${encodeURIComponent(eventId)}&ticketTypeId=${encodeURIComponent(type.id)}`} />}
                    >
                      <Ticket /> View tickets
                    </Button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
