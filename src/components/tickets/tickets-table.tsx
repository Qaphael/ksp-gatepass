"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, type ApiFailure } from "@/lib/api-client";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TicketDto } from "@/server/services/tickets.service";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { Serial } from "@/components/ui/serial";
import { formatDateTime } from "@/lib/time";
import { formatUGX } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import { Chip } from "@/components/ui/chip";
import { StatusBadge } from "@/components/ui/status-badge";

interface TicketsTableProps {
  tickets: TicketDto[];
  showEvent?: boolean;
  canRemove?: boolean;
}

function admissionLine(ticket: TicketDto): string {
  const trace = ticket.trace;
  if (ticket.status !== "SOLD") return "Unsold";
  if (!trace?.saleReference) return "Not admitted";
  if (trace.checkedInAt) {
    const time = formatDateTime(trace.checkedInAt, "Africa/Kampala", "en-UG", { hour: "2-digit", minute: "2-digit" });
    return trace.gate ? `${trace.gate} · ${time}` : time;
  }
  return "Not scanned";
}

function checkedInAt(ticket: TicketDto): Date | null {
  const trace = ticket.trace;
  if (!trace?.checkedInAt) return null;
  return new Date(trace.checkedInAt);
}

/** Inventory rows. Token material never reaches this component (rule 6). */
export function TicketsTable({ tickets, showEvent = true, canRemove = false }: TicketsTableProps) {
  const router = useRouter();
  const [selection, setSelection] = useState<{ pageKey: string; ids: Set<string> }>({ pageKey: "", ids: new Set() });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const pageKey = useMemo(() => tickets.map((ticket) => ticket.id).join("|"), [tickets]);
  const selectedIds = selection.pageKey === pageKey ? selection.ids : new Set<string>();
  const selectedTickets = tickets.filter((ticket) => selectedIds.has(ticket.id));
  const selectedEventId = selectedTickets[0]?.eventId;

  function toggle(ticket: TicketDto) {
    setSelection((current) => {
      const next = new Set(current.pageKey === pageKey ? current.ids : []);
      if (next.has(ticket.id)) next.delete(ticket.id);
      else if (ticket.status === "AVAILABLE" && (!selectedEventId || selectedEventId === ticket.eventId)) next.add(ticket.id);
      return { pageKey, ids: next };
    });
  }

  async function removeSelected() {
    setSaving(true);
    setError(null);
    const result = await apiFetch<{ tickets: TicketDto[] }>("/api/v1/tickets/bulk-remove", {
      method: "POST",
      body: JSON.stringify({ ticketIds: selectedTickets.map((ticket) => ticket.id), reason: reason.trim() }),
    });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    toast.success(`${selectedTickets.length} ticket${selectedTickets.length === 1 ? "" : "s"} removed from circulation. Records were retained.`);
    setSelection({ pageKey, ids: new Set() });
    setReason("");
    setDialogOpen(false);
    setSaving(false);
    router.refresh();
  }

  if (tickets.length === 0) {
    return (
      <Card>
        <CardContent className="px-4 py-8 text-center text-sm text-muted-foreground">
          No tickets match these filters.
        </CardContent>
      </Card>
    );
  }

  // Accent bar color by status
  function accentColor(status: string, checkedInAt: Date | null | undefined): string {
    if (status === "SOLD") return checkedInAt ? "bg-success" : "bg-primary";
    if (status === "AVAILABLE") return "bg-muted-foreground";
    if (status === "REVOKED" || status === "CANCELLED") return "bg-destructive";
    return "bg-muted-foreground";
  }

  // Status chip color
  function statusChip(status: string, checkedInAt: Date | null | undefined) {
    if (status === "SOLD" && checkedInAt) {
      return <Chip tone="success">Admitted</Chip>;
    }
    if (status === "SOLD") {
      return <Chip tone="neutral">Not admitted</Chip>;
    }
    if (status === "AVAILABLE") {
      return <Chip tone="neutral">Available</Chip>;
    }
    if (status === "RESERVED") {
      return <Chip tone="warning">Reserved</Chip>;
    }
    if (status === "REVOKED" || status === "CANCELLED") {
      return <Chip tone="destructive">{status}</Chip>;
    }
    return <Chip tone="neutral">{status}</Chip>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Bulk remove bar */}
      {canRemove ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
          <p className="text-sm text-muted-foreground">
            Select available tickets to revoke and remove them from active circulation. Their records remain in the history.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            disabled={!selectedIds.size}
            onClick={() => {
              setError(null);
              setDialogOpen(true);
            }}
          >
            <Ban className="size-4" /> Remove selected{selectedIds.size ? ` (${selectedIds.size})` : ""}
          </Button>
        </div>
      ) : null}

      <ResponsiveList
        cardsUntil="lg"
        cards={tickets.map((ticket) => {
          const trace = ticket.trace;
          const saleRef = trace?.saleReference ?? null;
          const saleId = trace?.saleId ?? null;
          const customerName = trace?.customerName ?? null;
          const customerPhoneMasked = trace?.customerPhoneMasked ?? null;
          const hasSale = Boolean(saleRef && saleId);
          const accent = accentColor(ticket.status, checkedInAt(ticket));
          const admissionText = admissionLine(ticket);
          const priceLabel = ticket.status === "SOLD" ? "Paid" : ticket.status === "AVAILABLE" ? "Price" : ticket.status === "REVOKED" || ticket.status === "CANCELLED" ? "Void" : "Price";

          return (
            <article
              key={ticket.id}
              className="relative overflow-hidden rounded-lg bg-card p-3 flex flex-col gap-2.5"
            >
              {/* Left accent bar (4px) */}
              <div className={cn("absolute inset-y-0 left-0 w-1", accent)} aria-hidden="true" />

              {/* Row 1: Serial + category (left) | Status badge (right) */}
              <div className="flex items-center justify-between gap-2 pl-1">
                <div className="flex items-center gap-2 min-w-0">
                  {canRemove && ticket.status === "AVAILABLE" ? (
                    <label
                      className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
                      aria-label={`Select ${ticket.serial}`}
                    >
                      <input
                        type="checkbox"
                        className="size-5 accent-primary"
                        checked={selectedIds.has(ticket.id)}
                        disabled={Boolean(selectedEventId && selectedEventId !== ticket.eventId)}
                        onChange={() => toggle(ticket)}
                      />
                    </label>
                  ) : null}
                  <span className="font-mono text-[13px] font-bold bg-muted rounded-md px-2 py-0.5">
                    <Serial>{ticket.serial}</Serial>
                  </span>
                  <Chip tone="neutral" className="text-[10px] px-2 py-0.5 rounded-md font-semibold truncate max-w-[120px]">
                    {ticket.ticketTypeName}
                  </Chip>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Shared StatusBadge domain="ticket" */}
                  <StatusBadge domain="ticket" status={ticket.status} />
                  {statusChip(ticket.status, checkedInAt(ticket))}
                </div>
              </div>

              {/* Row 2: Buyer name + phone (8 cols) | Price (4 cols) */}
              <div className="grid grid-cols-12 items-baseline gap-1 pl-1">
                <div className="col-span-8 flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">
                    {customerName ?? (ticket.status === "AVAILABLE"
                      ? "Unassigned"
                      : ticket.status === "REVOKED" || ticket.status === "CANCELLED"
                        ? "Cancelled"
                        : "—")}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground truncate">
                    {customerPhoneMasked ?? (ticket.status === "AVAILABLE"
                      ? ticket.batchRef ?? "In stock"
                      : showEvent
                        ? ticket.eventName
                        : "—")}
                  </span>
                </div>
                <div className="col-span-4 flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {priceLabel}
                  </span>
                  <span className={cn("font-mono text-[13px] font-bold", ticket.status === "REVOKED" || ticket.status === "CANCELLED" ? "text-muted-foreground line-through" : "text-foreground")}>
                    {ticket.ticketTypePriceUgx ? formatUGX(ticket.ticketTypePriceUgx) : "—"}
                  </span>
                </div>
              </div>

              {/* Footer strip */}
              <div className="mt-auto flex items-center justify-between bg-muted/50 -mx-3 -mb-3 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0 text-[11px] font-mono text-muted-foreground">
                  <span className="truncate">
                    {ticket.status === "SOLD" && trace?.checkedInAt
                      ? admissionText
                      : ticket.status === "SOLD"
                        ? "Not scanned"
                        : "Unsold"}
                  </span>
                  {hasSale && saleRef && (
                    <>
                      <span className="inline-block w-1 h-1 rounded-full bg-border shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        <Link href={`/sales/${saleId}`} className="text-primary font-medium hover:underline">
                          {saleRef}
                        </Link>
                      </span>
                    </>
                  )}
                </div>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="h-8 px-2.5 rounded-md bg-muted hover:bg-accent text-foreground text-[11px] font-mono flex items-center gap-1 active:scale-[0.98] transition-all"
                >
                  <span>Open</span>
                  <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                </Link>
              </div>
            </article>
          );
        })}
        table={
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {canRemove ? <TableHead className="w-12 text-[11px] font-mono uppercase">Select</TableHead> : null}
                  <TableHead className="text-[11px] font-mono uppercase">Serial</TableHead>
                  <TableHead className="text-[11px] font-mono uppercase">Category</TableHead>
                  <TableHead className="text-[11px] font-mono uppercase">Status</TableHead>
                  <TableHead className="text-[11px] font-mono uppercase">Buyer</TableHead>
                  <TableHead className="text-[11px] font-mono uppercase">Sale ref</TableHead>
                  <TableHead className="text-[11px] font-mono uppercase">Admission</TableHead>
                  <TableHead className="text-[11px] font-mono uppercase">Batch</TableHead>
                  <TableHead className="text-[11px] font-mono uppercase text-right">Price</TableHead>
                  <TableHead className="w-24 text-[11px] font-mono uppercase">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => {
                  const trace = ticket.trace;
                  const saleRef = trace?.saleReference ?? null;
                  const saleId = trace?.saleId ?? null;
                  const customerName = trace?.customerName ?? null;
                  const customerPhoneMasked = trace?.customerPhoneMasked ?? null;
                  const hasSale = Boolean(saleRef && saleId);
                  const admissionText = admissionLine(ticket);

                  return (
                    <TableRow key={ticket.id} className="min-h-14 border-t">
                      {canRemove ? (
                        <TableCell className="p-2">
                          <input
                            type="checkbox"
                            aria-label={`Select ${ticket.serial} for removal`}
                            className="size-5 accent-primary"
                            checked={selectedIds.has(ticket.id)}
                            disabled={ticket.status !== "AVAILABLE" || Boolean(selectedEventId && selectedEventId !== ticket.eventId)}
                            onChange={() => toggle(ticket)}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="font-mono whitespace-nowrap p-3">
                        <Link href={`/tickets/${ticket.id}`} className="hover:underline">
                          <Serial>{ticket.serial}</Serial>
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap p-3">
                        <Chip tone="neutral" className="text-[10px] px-2 py-0.5">
                          {ticket.ticketTypeName}
                        </Chip>
                      </TableCell>
                      <TableCell className="whitespace-nowrap p-3">
                        <StatusBadge domain="ticket" status={ticket.status} />
                        {ticket.status === "SOLD" && trace?.checkedInAt && <Chip tone="success" className="ml-1">Admitted</Chip>}
                        {ticket.status === "SOLD" && !trace?.checkedInAt && <Chip tone="neutral" className="ml-1">Not admitted</Chip>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm p-3">
                        {hasSale ? (
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <Link href={`/sales/${saleId}`} className="font-medium hover:underline truncate min-w-0">
                              {saleRef}
                            </Link>
                            {customerName ? (
                              <span className="text-sm text-muted-foreground truncate min-w-0">{customerName}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">Unassigned</span>
                            )}
                            {customerPhoneMasked ? <span className="font-mono text-xs text-muted-foreground truncate min-w-0">{customerPhoneMasked}</span> : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap p-3">
                        {hasSale ? (
                          <Link href={`/sales/${saleId}`} className="text-primary font-medium hover:underline">
                            {saleRef}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm p-3">
                        <span className={cn("font-mono", ticket.status === "SOLD" && trace?.checkedInAt ? "text-success" : "text-muted-foreground")}>
                          {admissionText}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap p-3 text-muted-foreground">
                        {ticket.batchRef ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right p-3">
                        <span className={cn("font-mono font-bold", ticket.status === "REVOKED" || ticket.status === "CANCELLED" ? "text-muted-foreground line-through" : "text-foreground")}>
                          {ticket.ticketTypePriceUgx ? formatUGX(ticket.ticketTypePriceUgx) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="p-3">
                        <Link
                          href={`/tickets/${ticket.id}`}
                          className="inline-flex h-8 items-center justify-center rounded-md bg-muted hover:bg-accent text-foreground text-[11px] font-mono transition-colors"
                        >
                          Open
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        }
      />
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) setDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {selectedTickets.length} ticket{selectedTickets.length === 1 ? "" : "s"} from circulation?</DialogTitle>
            <DialogDescription>
              This revokes the selected available tickets so their QR codes cannot be admitted. It does not erase their serials or history. Sold, checked-in, and previously removed tickets cannot be selected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium">Reason (required)</p>
            <Textarea
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Unused test tickets"
              disabled={saving}
            />
            {error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={reason.trim().length < 3 || saving || !selectedIds.size}
              onClick={() => void removeSelected()}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Ban className="size-4" />}
              Revoke and remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}