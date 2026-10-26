import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ServiceError } from "@/lib/api";
import { getTicket, type TicketDetail } from "@/server/services/tickets.service";
import { getEvent } from "@/server/services/events.service";
import { RevokeTicketDialog } from "@/components/tickets/revoke-ticket-dialog";
import { TicketActions } from "@/components/tickets/ticket-actions";
import { TicketPreview } from "@/components/tickets/ticket-preview";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { formatTimestamp } from "@/components/tickets/ticket-format";

export const instant = false;

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");

  const { id } = await params;
  let ticket: TicketDetail;
  try {
    ticket = await getTicket(ctx, id);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }

  const printable =
    ticket.status !== "REVOKED" && ticket.status !== "CANCELLED";
  const event = printable ? await getEvent(ctx, ticket.eventId) : null;
  const canRevoke =
    can(ctx.role, "ticket:revoke") &&
    (ticket.status === "AVAILABLE" || ticket.status === "RESERVED");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to inventory
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {ticket.serial}
            </h1>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.eventName} · {ticket.ticketTypeName}
            {ticket.batchRef ? ` · batch ${ticket.batchRef}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TicketActions
            ticketId={ticket.id}
            serial={ticket.serial}
            canPrint={can(ctx.role, "ticket:print")}
            printable={printable}
            hasPrintHistory={ticket.printHistory.length > 0}
          />
          {canRevoke ? (
            <RevokeTicketDialog ticketId={ticket.id} serial={ticket.serial} />
          ) : null}
        </div>
      </div>

      {printable && event ? (
        <Card>
          <CardHeader>
            <CardTitle>Ticket preview</CardTitle>
            <CardDescription>
              The QR below is the real code printed on this ticket.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TicketPreview
              serial={ticket.serial}
              categoryName={ticket.ticketTypeName}
              event={{
                name: event.name,
                venue: event.venue,
                address: event.address,
                eventDate: event.eventDate,
                startTime: event.startTime,
                endTime: event.endTime,
                ticketFooterText: event.ticketFooterText,
              }}
              qrSrc={`/api/v1/tickets/${ticket.id}/qr.png`}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Status" value={ticket.status} />
            <Detail label="Event" value={ticket.eventName} />
            <Detail label="Category" value={ticket.ticketTypeName} />
            <Detail
              label="Batch"
              value={ticket.batchRef ?? "—"}
              href={ticket.batchId ? `/tickets/batches/${ticket.batchId}` : undefined}
            />
            <Detail label="Created" value={formatTimestamp(ticket.createdAt)} />
            <Detail label="Last updated" value={formatTimestamp(ticket.updatedAt)} />
            {ticket.revokeReason ? (
              <Detail
                label="Revoke reason"
                value={`${ticket.revokeReason} (by user ${
                  ticket.revokedById?.slice(0, 8) ?? "unknown"
                }…)`}
              />
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Print history</CardTitle>
          <CardDescription>
            Every printed or exported output of this ticket is traceable.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {ticket.printHistory.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              Never printed.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Output</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ticket.printHistory.map((print) => (
                  <TableRow key={print.id}>
                    <TableCell>{print.kind}</TableCell>
                    <TableCell className="tabular-nums">
                      {print.ticketCount}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatTimestamp(print.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {print.actorId ? `${print.actorId.slice(0, 8)}…` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit history</CardTitle>
          <CardDescription>
            Security-relevant actions recorded against this ticket.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {ticket.auditHistory.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              No recorded actions yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ticket.auditHistory.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">
                      {entry.action}
                    </TableCell>
                    <TableCell>{entry.outcome}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatTimestamp(entry.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-72 truncate font-mono text-xs text-muted-foreground">
                      {entry.summary ? JSON.stringify(entry.summary) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">
        {href ? (
          <Link href={href} className="hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
