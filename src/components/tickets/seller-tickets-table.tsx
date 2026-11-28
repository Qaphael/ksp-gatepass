"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTable, type ColumnDef } from "@tanstack/react-table";
import { TicketIcon } from "lucide-react";
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Serial } from "@/components/ui/serial";
import type { TicketStatus } from "@/generated/prisma/client";

export interface SellerTicketRow {
  id: string;
  serial: string;
  category: string;
  eventName: string;
  status: string;
  saleId: string;
  saleReference: string;
}

export function SellerTicketsTable({
  tickets,
  totalSales,
  page,
  pages,
}: {
  tickets: SellerTicketRow[];
  totalSales: number;
  page: number;
  pages: number;
}) {
  const columns = useMemo<ColumnDef<DataGridFeatures, SellerTicketRow>[]>(
    () => [
      {
        accessorKey: "serial",
        header: ({ column }) => <DataGridColumnHeader title="Serial" column={column} />,
        cell: ({ row }) => <Serial className="font-semibold">{row.original.serial}</Serial>,
        meta: { headerTitle: "Serial" },
      },
      {
        accessorKey: "category",
        header: ({ column }) => <DataGridColumnHeader title="Category" column={column} />,
        cell: ({ row }) => <span className="text-sm">{row.original.category}</span>,
        meta: { headerTitle: "Category" },
      },
      {
        accessorKey: "eventName",
        header: ({ column }) => <DataGridColumnHeader title="Event" column={column} />,
        cell: ({ row }) => <span className="text-sm">{row.original.eventName}</span>,
        meta: { headerTitle: "Event" },
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
        cell: ({ row }) => <TicketStatusBadge status={row.original.status as TicketStatus} />,
        meta: { headerTitle: "Status" },
      },
      {
        accessorKey: "saleReference",
        header: ({ column }) => <DataGridColumnHeader title="Sale" column={column} />,
        cell: ({ row }) => (
          <Link
            href={`/sales/${row.original.saleId}`}
            className="font-mono text-sm underline underline-offset-4"
          >
            {row.original.saleReference}
          </Link>
        ),
        meta: { headerTitle: "Sale" },
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    data: tickets,
    columns,
    manualPagination: true,
    rowCount: totalSales,
  });

  if (tickets.length === 0) {
    return (
      <Frame spacing="default">
        <FramePanel>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TicketIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No tickets yet</EmptyTitle>
              <EmptyDescription>Tickets from your completed sales will appear here.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} size="sm" render={<Link href="/sales/new" />}>
                Create a sale
              </Button>
            </EmptyContent>
          </Empty>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <DataGrid
      table={table}
      recordCount={tickets.length}
      tableLayout={{ dense: true, rowBorder: true, headerBackground: true }}
      tableClassNames={{ base: "min-w-[640px]" }}
    >
      <Frame spacing="default">
        <FrameHeader>
          <FrameTitle>Issued tickets</FrameTitle>
          <FrameDescription>
            {totalSales} sales · page {page} of {pages}
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="p-0">
          <DataGridScrollArea orientation="horizontal">
            <DataGridTable />
          </DataGridScrollArea>
        </FramePanel>
        <FrameFooter>
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs tabular-nums">
              Page {page} of {pages}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Button
                  nativeButton={false}
                  variant="outline"
                  size="sm"
                  render={<Link href={`/tickets?page=${page - 1}`} />}
                >
                  Previous
                </Button>
              ) : null}
              {page < pages ? (
                <Button
                  nativeButton={false}
                  variant="outline"
                  size="sm"
                  render={<Link href={`/tickets?page=${page + 1}`} />}
                >
                  Next
                </Button>
              ) : null}
            </div>
          </div>
        </FrameFooter>
      </Frame>
    </DataGrid>
  );
}
