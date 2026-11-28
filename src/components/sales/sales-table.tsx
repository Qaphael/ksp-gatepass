"use client";

import { useMemo } from "react";
import Link from "next/link";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SaleDto } from "@/server/services/sales.service";

export function SalesTable({ sales }: { sales: SaleDto[] }) {
  const columns = useMemo<ColumnDef<DataGridFeatures, SaleDto>[]>(
    () => [
      {
        accessorKey: "reference",
        header: ({ column }) => <DataGridColumnHeader title="Reference" column={column} />,
        size: 180,
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/sales/${row.original.id}`} className="font-mono font-medium hover:underline">
              {row.original.reference}
            </Link>
            <div className="text-muted-foreground truncate text-xs">{row.original.eventName}</div>
          </div>
        ),
        meta: { headerTitle: "Reference" },
      },
      {
        accessorKey: "seller",
        header: ({ column }) => <DataGridColumnHeader title="Seller" column={column} />,
        size: 130,
        cell: ({ row }) => <span className="text-sm">{row.original.seller.displayName}</span>,
        meta: { headerTitle: "Seller" },
      },
      {
        accessorKey: "items",
        header: ({ column }) => <DataGridColumnHeader title="Tickets" column={column} />,
        size: 90,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.items.reduce((sum, item) => sum + item.quantity, 0)}
          </span>
        ),
        meta: {
          headerTitle: "Tickets",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
        },
      },
      {
        accessorKey: "totalUgx",
        header: ({ column }) => <DataGridColumnHeader title="Total" column={column} />,
        size: 110,
        meta: {
          headerTitle: "Total",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
        },
        cell: ({ row }) => <Money amount={row.original.totalUgx} />,
      },
      {
        accessorKey: "amountPaidUgx",
        header: ({ column }) => <DataGridColumnHeader title="Paid" column={column} />,
        size: 110,
        meta: {
          headerTitle: "Paid",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
        },
        cell: ({ row }) => <Money amount={row.original.amountPaidUgx} />,
      },
      {
        accessorKey: "balanceUgx",
        header: ({ column }) => <DataGridColumnHeader title="Balance" column={column} />,
        size: 110,
        meta: {
          headerTitle: "Balance",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
        },
        cell: ({ row }) => <Money amount={row.original.balanceUgx} />,
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
        size: 140,
        cell: ({ row }) => <StatusBadge domain="sale" status={row.original.status} />,
        meta: { headerTitle: "Status" },
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: sales,
    getRowId: (sale) => sale.id,
  });

  return (
    <DataGrid
      table={table}
      recordCount={sales.length}
      tableLayout={{ dense: true, rowBorder: true, headerBackground: true }}
      tableClassNames={{ base: "min-w-[720px]" }}
    >
      <Frame spacing="default">
        <FramePanel className="p-0">
          <DataGridScrollArea orientation="horizontal">
            <DataGridTable />
          </DataGridScrollArea>
        </FramePanel>
      </Frame>
    </DataGrid>
  );
}
