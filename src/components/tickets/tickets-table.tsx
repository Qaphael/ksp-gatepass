"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, type ApiFailure } from "@/lib/api-client";
import {
  Frame,
  FramePanel,
} from "@/components/reui/frame";
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import type { TicketDto } from "@/server/services/tickets.service";
import { formatTimestamp } from "./ticket-format";
import { TicketStatusBadge } from "./ticket-status-badge";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { Serial } from "@/components/ui/serial";
import { formatDateTime } from "@/lib/time";
import { formatUGX } from "@/components/ui/money";
import { cn } from "@/lib/utils";

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
    return trace.gate ? `Admitted · ${time} · ${trace.gate}` : `Admitted · ${time}`;
  }
  return "Not admitted";
}

function admissionTone(ticket: TicketDto): string {
  const line = admissionLine(ticket);
  if (line === "Unsold") return "text-muted-foreground";
  if (line.startsWith("Admitted")) return "text-success-foreground";
  return "text-muted-foreground";
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
  const selectedIds = useMemo(
    () => (selection.pageKey === pageKey ? selection.ids : new Set<string>()),
    [selection.pageKey, selection.ids, pageKey],
  );
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
    setSaving(true); setError(null);
    const result = await apiFetch<{ tickets: TicketDto[] }>("/api/v1/tickets/bulk-remove", {
      method: "POST",
      body: JSON.stringify({ ticketIds: selectedTickets.map((ticket) => ticket.id), reason: reason.trim() }),
    });
    if (!result.ok) { setError(result.error); setSaving(false); return; }
    toast.success(`${selectedTickets.length} ticket${selectedTickets.length === 1 ? "" : "s"} removed from circulation. Records were retained.`);
    setSelection({ pageKey, ids: new Set() }); setReason(""); setDialogOpen(false); setSaving(false); router.refresh();
  }

  const columns = useMemo<ColumnDef<DataGridFeatures, TicketDto>[]>(() => {
    const defs: ColumnDef<DataGridFeatures, TicketDto>[] = [];
    if (canRemove) {
      defs.push({
        id: "select",
        header: () => <span className="sr-only">Select</span>,
        size: 48,
        cell: ({ row }) => {
          const ticket = row.original;
          return (
            <input
              type="checkbox"
              aria-label={`Select ${ticket.serial} for removal`}
              className="size-4 accent-primary"
              checked={selectedIds.has(ticket.id)}
              disabled={ticket.status !== "AVAILABLE" || Boolean(selectedEventId && selectedEventId !== ticket.eventId)}
              onChange={() =>
                setSelection((current) => {
                  const next = new Set(current.pageKey === pageKey ? current.ids : []);
                  if (next.has(ticket.id)) next.delete(ticket.id);
                  else if (ticket.status === "AVAILABLE" && (!selectedEventId || selectedEventId === ticket.eventId)) next.add(ticket.id);
                  return { pageKey, ids: next };
                })
              }
            />
          );
        },
      });
    }
    defs.push(
      {
        accessorKey: "serial",
        header: "Serial",
        size: 150,
        cell: ({ row }) => (
          <Link href={`/tickets/${row.original.id}`} className="font-medium hover:underline">
            <Serial>{row.original.serial}</Serial>
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 150,
        cell: ({ row }) => (
          <div className="min-w-0">
            <TicketStatusBadge status={row.original.status} />
            {row.original.revokeReason ? (
              <p className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={row.original.revokeReason}>
                {row.original.revokeReason}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "ticketTypeName",
        header: "Category",
        size: 130,
      },
    );
    if (showEvent) {
      defs.push({
        accessorKey: "eventName",
        header: "Event",
        size: 150,
        meta: { cellClassName: "max-w-40 truncate" },
      });
    }
    defs.push(
      {
        id: "sale",
        header: "Sale / buyer",
        size: 180,
        cell: ({ row }) => {
          const trace = row.original.trace;
          const saleRef = trace?.saleReference ?? null;
          const saleId = trace?.saleId ?? null;
          if (!saleRef || !saleId) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link href={`/sales/${saleId}`} className="truncate font-medium hover:underline">{saleRef}</Link>
              {trace?.customerName ? <span className="truncate text-sm text-muted-foreground">{trace.customerName}</span> : null}
              {trace?.customerPhoneMasked ? <span className="truncate font-mono text-xs text-muted-foreground">{trace.customerPhoneMasked}</span> : null}
            </div>
          );
        },
      },
      {
        id: "admission",
        header: "Admission",
        size: 180,
        cell: ({ row }) => (
          <span className={cn("font-mono", admissionTone(row.original))}>{admissionLine(row.original)}</span>
        ),
      },
      {
        accessorKey: "batchRef",
        header: "Batch",
        size: 120,
        meta: { cellClassName: "font-mono text-xs" },
        cell: ({ row }) => row.original.batchRef ?? "—",
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 130,
        meta: { cellClassName: "text-muted-foreground" },
        cell: ({ row }) => formatTimestamp(row.original.createdAt),
      },
    );
    return defs;
  }, [canRemove, showEvent, selectedIds, selectedEventId, pageKey]);

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: tickets,
    getRowId: (ticket) => ticket.id,
  });

  if (tickets.length === 0) {
    return (
      <Frame spacing="default">
        <FramePanel className="py-8 text-center text-sm text-muted-foreground">
          No tickets match these filters.
        </FramePanel>
      </Frame>
    );
  }

  return <div className="space-y-3">
    {canRemove ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3"><p className="text-sm text-muted-foreground">Select available tickets to revoke and remove them from active circulation. Their records remain in the history.</p><Button type="button" variant="destructive" className="min-h-11" disabled={!selectedIds.size} onClick={() => { setError(null); setDialogOpen(true); }}><Ban /> Remove selected{selectedIds.size ? ` (${selectedIds.size})` : ""}</Button></div> : null}
    <ResponsiveList
    cardsUntil="lg"
    cards={tickets.map((ticket) => {
      const trace = ticket.trace;
      const saleRef = trace?.saleReference ?? null;
      const saleId = trace?.saleId ?? null;
      const customerName = trace?.customerName ?? null;
      const customerPhoneMasked = trace?.customerPhoneMasked ?? null;
      const hasSale = Boolean(saleRef && saleId);
      // Accent bar color by status
      const accent = ticket.status === "SOLD"
        ? (trace?.checkedInAt ? "bg-success" : "bg-primary")
        : ticket.status === "AVAILABLE" ? "bg-muted-foreground"
        : ticket.status === "REVOKED" || ticket.status === "CANCELLED" ? "bg-destructive"
        : "bg-muted-foreground";
      const admissionText = admissionLine(ticket);
      const priceLabel = ticket.status === "SOLD" ? "Paid" : ticket.status === "AVAILABLE" ? "Price" : ticket.status === "REVOKED" || ticket.status === "CANCELLED" ? "Void" : "Price";
      return <article key={ticket.id} className="relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40">
        {/* Left accent bar */}
        <div className={cn("absolute left-0 top-0 bottom-0 w-1", accent)} aria-hidden="true" />
        {/* Top row: serial + category (left) | status badge (right) */}
        <div className="flex items-center justify-between gap-2 pl-1">
          <div className="flex items-center gap-2 min-w-0">
            {canRemove && ticket.status === "AVAILABLE" ? (
              <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center" aria-label={`Select ${ticket.serial}`}>
                <input type="checkbox" className="size-5 accent-primary" checked={selectedIds.has(ticket.id)} disabled={Boolean(selectedEventId && selectedEventId !== ticket.eventId)} onChange={() => toggle(ticket)} />
              </label>
            ) : null}
            <span className="font-mono text-sm font-bold tracking-tight bg-muted px-2 py-0.5 rounded-md">
              <Serial>{ticket.serial}</Serial>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-semibold truncate">
              {ticket.ticketTypeName}
            </span>
          </div>
          <span className={cn("flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold", admissionTone(ticket) === "text-success-foreground" ? "bg-success/15 text-success" : ticket.status === "REVOKED" || ticket.status === "CANCELLED" ? "bg-destructive/10 text-destructive" : ticket.status === "SOLD" && !trace?.checkedInAt ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {ticket.status === "SOLD" && trace?.checkedInAt ? "ADMITTED" : ticket.status === "SOLD" ? "SOLD" : ticket.status.replaceAll("_", " ")}
          </span>
        </div>
        {/* Middle row: buyer name + phone (8 cols) | price (4 cols) */}
        <div className="grid grid-cols-12 items-baseline gap-1 pl-1">
          <div className="col-span-8 flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">
              {customerName ?? (ticket.status === "AVAILABLE" ? "Unassigned" : ticket.status === "REVOKED" || ticket.status === "CANCELLED" ? "Cancelled" : "—")}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground truncate">
              {customerPhoneMasked ?? (ticket.status === "AVAILABLE" ? (ticket.batchRef ?? "In stock") : showEvent ? ticket.eventName : "—")}
            </span>
          </div>
          <div className="col-span-4 flex flex-col items-end">
            <span className="text-[10px] text-muted-foreground uppercase">{priceLabel}</span>
            <span className={cn("font-mono text-sm font-bold", ticket.status === "REVOKED" || ticket.status === "CANCELLED" ? "text-muted-foreground line-through" : "text-foreground")}>
              {ticket.ticketTypePriceUgx ? formatUGX(ticket.ticketTypePriceUgx) : "—"}
            </span>
          </div>
        </div>
        {/* Bottom row: admission info + ref (left) | Pass button (right) */}
        <div className="pt-2 flex items-center justify-between pl-1 bg-muted/30 -mx-3 -mb-3 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
            <span className={cn("text-xs flex items-center gap-1 truncate", admissionTone(ticket))}>
              {admissionText}
            </span>
            {hasSale && saleRef ? <>
              <span className="inline-block size-1 rounded-full bg-border" aria-hidden="true" />
              <span className="text-xs truncate"><Link href={`/sales/${saleId}`} className="text-primary font-medium hover:underline">{saleRef}</Link></span>
            </> : null}
          </div>
          <Link href={`/tickets/${ticket.id}`} className="h-8 px-2.5 rounded-md bg-muted hover:bg-accent text-foreground text-xs font-semibold flex items-center gap-1 transition-colors">
            <span>Pass</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </article>;
    })}
    table={(
    <DataGrid
      table={table}
      recordCount={tickets.length}
      tableLayout={{ dense: true, rowBorder: true, headerBackground: true }}
      tableClassNames={{ base: "min-w-[760px]" }}
    >
      <Frame spacing="default">
        <FramePanel className="p-0">
          <DataGridScrollArea orientation="horizontal">
            <DataGridTable />
          </DataGridScrollArea>
        </FramePanel>
      </Frame>
    </DataGrid>
    )}
    />
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Remove {selectedTickets.length} ticket{selectedTickets.length === 1 ? "" : "s"} from circulation?</DialogTitle><DialogDescription>This revokes the selected available tickets so their QR codes cannot be admitted. It does not erase their serials or history. Sold, checked-in, and previously removed tickets cannot be selected.</DialogDescription></DialogHeader><div className="space-y-2"><p className="text-sm font-medium">Reason (required)</p><Textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Unused test tickets" disabled={saving} />{error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : null}</div><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="button" variant="destructive" className="min-h-11" disabled={reason.trim().length < 3 || saving || !selectedIds.size} onClick={() => void removeSelected()}>{saving ? <Loader2 className="animate-spin" /> : <Ban />} Revoke and remove</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
