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

  return (
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
                <TableCell className="font-mono font-medium whitespace-nowrap">
                  <Link
                    href={`/tickets/${ticket.id}`}
                    className="hover:underline"
                  >
                    {ticket.serial}
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
  );
}
