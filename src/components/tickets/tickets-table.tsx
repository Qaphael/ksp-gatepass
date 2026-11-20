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
import { formatTimestamp } from "./ticket-format";
import { TicketStatusBadge } from "./ticket-status-badge";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { Serial } from "@/components/ui/serial";
import { formatDateTime } from "@/lib/time";
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
    setSaving(true); setError(null);
    const result = await apiFetch<{ tickets: TicketDto[] }>("/api/v1/tickets/bulk-remove", {
      method: "POST",
      body: JSON.stringify({ ticketIds: selectedTickets.map((ticket) => ticket.id), reason: reason.trim() }),
    });
    if (!result.ok) { setError(result.error); setSaving(false); return; }
    toast.success(`${selectedTickets.length} ticket${selectedTickets.length === 1 ? "" : "s"} removed from circulation. Records were retained.`);
    setSelection({ pageKey, ids: new Set() }); setReason(""); setDialogOpen(false); setSaving(false); router.refresh();
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
      return <div key={ticket.id} className="flex min-w-0 gap-3 rounded-xl border border-border bg-card p-4">{canRemove && ticket.status === "AVAILABLE" ? <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center" aria-label={`Select ${ticket.serial}`}><input type="checkbox" className="size-5 accent-primary" checked={selectedIds.has(ticket.id)} disabled={Boolean(selectedEventId && selectedEventId !== ticket.eventId)} onChange={() => toggle(ticket)} /></label> : null}<Link href={`/tickets/${ticket.id}`} className="block min-w-0 flex-1 active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><Serial className="min-w-0 text-base font-semibold">{ticket.serial}</Serial><TicketStatusBadge status={ticket.status} /></div>
        <p className="mt-1 truncate text-base font-medium">{ticket.ticketTypeName}</p>
        {showEvent ? <p className="truncate text-sm text-muted-foreground">{ticket.eventName}</p> : null}
        {hasSale ? (
          <div className="mt-2 flex flex-col gap-1 text-sm">
            <div className="flex items-start gap-1"><span className="text-muted-foreground text-[10px]">Sale</span>{" "}<Link href={`/sales/${saleId}`} className="text-primary font-medium hover:underline truncate min-w-0">{saleRef}</Link></div>
            {customerName ? <div className="flex items-start gap-1"><span className="text-muted-foreground text-[10px]">Buyer</span>{" "}<span className="font-medium truncate min-w-0">{customerName}</span></div> : null}
            {customerPhoneMasked ? <div className="flex items-start gap-1"><span className="text-muted-foreground text-[10px]">Phone</span>{" "}<span className="font-mono text-muted-foreground">{customerPhoneMasked}</span></div> : null}
            <div className="flex items-start gap-1"><span className="text-muted-foreground text-[10px]">Admission</span>{" "}<span className={cn("font-mono", admissionTone(ticket))}>{admissionLine(ticket)}</span></div>
          </div>
        ) : (
          <div className="mt-2 flex items-start gap-1 text-sm"><span className="text-muted-foreground text-[10px]">Admission</span>{" "}<span className="font-mono text-muted-foreground">Unsold</span></div>
        )}
        <div className="mt-2 flex min-w-0 flex-wrap justify-between gap-x-2 gap-y-1 text-sm text-muted-foreground"><span className="min-w-0 break-all">{ticket.batchRef ?? "No batch"}</span><span className="shrink-0">{formatTimestamp(ticket.createdAt)}</span></div>
      </Link></div>;
    })}
    table={(
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {canRemove ? <TableHead className="w-12">Select</TableHead> : null}
              <TableHead>Serial</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              {showEvent ? <TableHead>Event</TableHead> : null}
              <TableHead>Sale / buyer</TableHead>
              <TableHead>Admission</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => {
              const trace = ticket.trace;
              const saleRef = trace?.saleReference ?? null;
              const saleId = trace?.saleId ?? null;
              const customerName = trace?.customerName ?? null;
              const hasSale = Boolean(saleRef && saleId);
              return (
                <TableRow key={ticket.id}>
                  {canRemove ? <TableCell><input type="checkbox" aria-label={`Select ${ticket.serial} for removal`} className="size-5 accent-primary" checked={selectedIds.has(ticket.id)} disabled={ticket.status !== "AVAILABLE" || Boolean(selectedEventId && selectedEventId !== ticket.eventId)} onChange={() => toggle(ticket)} /></TableCell> : null}
                  <TableCell className="font-medium whitespace-nowrap">
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="hover:underline"
                    >
                      <Serial>{ticket.serial}</Serial>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TicketStatusBadge status={ticket.status} />
                    {ticket.revokeReason ? (
                      <p
                        className="mt-1 max-w-48 truncate text-xs text-muted-foreground"
                        title={ticket.revokeReason}
                      >
                        {ticket.revokeReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {ticket.ticketTypeName}
                  </TableCell>
                  {showEvent ? (
                    <TableCell className="max-w-40 truncate">
                      {ticket.eventName}
                    </TableCell>
                  ) : null}
                  <TableCell className="whitespace-nowrap text-sm">
                    {hasSale ? (
                      <div className="flex flex-col gap-0.5">
                        <Link href={`/sales/${saleId}`} className="font-medium hover:underline truncate min-w-0">{saleRef}</Link>
                        {customerName ? <span className="text-sm text-muted-foreground truncate min-w-0">{customerName}</span> : null}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    <span className={cn("font-mono", admissionTone(ticket))}>{admissionLine(ticket)}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {ticket.batchRef ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatTimestamp(ticket.createdAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    )}
    />
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Remove {selectedTickets.length} ticket{selectedTickets.length === 1 ? "" : "s"} from circulation?</DialogTitle><DialogDescription>This revokes the selected available tickets so their QR codes cannot be admitted. It does not erase their serials or history. Sold, checked-in, and previously removed tickets cannot be selected.</DialogDescription></DialogHeader><div className="space-y-2"><p className="text-sm font-medium">Reason (required)</p><Textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Unused test tickets" disabled={saving} />{error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : null}</div><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="button" variant="destructive" className="min-h-11" disabled={reason.trim().length < 3 || saving || !selectedIds.size} onClick={() => void removeSelected()}>{saving ? <Loader2 className="animate-spin" /> : <Ban />} Revoke and remove</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
