import Link from "next/link";
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

interface TicketsTableProps {
  tickets: TicketDto[];
  showEvent?: boolean;
}

/** Inventory rows. Token material never reaches this component (rule 6). */
export function TicketsTable({ tickets, showEvent = true }: TicketsTableProps) {
  if (tickets.length === 0) {
    return (
      <Card>
        <CardContent className="px-4 py-8 text-center text-sm text-muted-foreground">
          No tickets match these filters.
        </CardContent>
      </Card>
    );
  }

  return <ResponsiveList
    cards={tickets.map((ticket) => <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="block rounded-xl border border-border bg-card p-4 active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start justify-between gap-3"><Serial className="text-base font-semibold">{ticket.serial}</Serial><TicketStatusBadge status={ticket.status} /></div>
      <p className="mt-2 truncate text-base font-medium">{ticket.ticketTypeName}</p>
      {showEvent ? <p className="truncate text-sm text-muted-foreground">{ticket.eventName}</p> : null}
      <div className="mt-3 flex justify-between gap-2 text-sm text-muted-foreground"><span>{ticket.batchRef ?? "No batch"}</span><span>{formatTimestamp(ticket.createdAt)}</span></div>
    </Link>)}
    table={(
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serial</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              {showEvent ? <TableHead>Event</TableHead> : null}
              <TableHead>Batch</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id}>
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
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {ticket.batchRef ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatTimestamp(ticket.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    )}
  />;
}
