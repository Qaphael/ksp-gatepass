"use client";

import { useMemo } from "react";
import { useTable, type ColumnDef } from "@tanstack/react-table";
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ReversePaymentButton } from "@/components/sales/sale-detail-actions";
import { formatUGX } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";

export interface SalePaymentRow {
  id: string;
  reference: string;
  recordedAtFormatted: string;
  method: string;
  amountUgx: number;
  netAmountUgx: number;
  status: "RECORDED" | "REVERSED" | "REFUNDED";
}

export function SalePaymentsTable({
  payments,
  canReverse,
}: {
  payments: SalePaymentRow[];
  canReverse: boolean;
}) {
  const columns = useMemo<ColumnDef<DataGridFeatures, SalePaymentRow>[]>(
    () => [
      {
        accessorKey: "reference",
        header: ({ column }) => <DataGridColumnHeader title="Reference" column={column} />,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-sm font-medium">{row.original.reference}</span>
            <span className="text-muted-foreground font-mono text-xs">
              {row.original.recordedAtFormatted} EAT
            </span>
          </div>
        ),
        meta: { headerTitle: "Reference" },
      },
      {
        accessorKey: "method",
        header: ({ column }) => <DataGridColumnHeader title="Method" column={column} />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {row.original.method.replaceAll("_", " ")}
          </span>
        ),
        meta: { headerTitle: "Method" },
      },
      {
        accessorKey: "amountUgx",
        header: ({ column }) => <DataGridColumnHeader title="Amount" column={column} />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums">
            {formatUGX(row.original.amountUgx)}
          </span>
        ),
        meta: {
          headerTitle: "Amount",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
        },
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
        cell: ({ row }) => <StatusBadge domain="payment" status={row.original.status} />,
        meta: { headerTitle: "Status" },
      },
      {
        id: "action",
        header: "",
        cell: ({ row }) =>
          canReverse && row.original.netAmountUgx > 0 ? (
            <div className="flex justify-end">
              <ReversePaymentButton
                paymentId={row.original.id}
                reference={row.original.reference}
                amountUgx={row.original.netAmountUgx}
              />
            </div>
          ) : null,
      },
    ],
    [canReverse],
  );

  const table = useTable({
    features: dataGridFeatures,
    data: payments,
    columns,
  });

  return (
    <DataGrid
      table={table}
      recordCount={payments.length}
      emptyMessage="No payments recorded."
      tableLayout={{ dense: true, rowBorder: true, headerBackground: true }}
      tableClassNames={{ base: "min-w-[600px]" }}
    >
      <DataGridScrollArea orientation="horizontal">
        <DataGridTable />
      </DataGridScrollArea>
    </DataGrid>
  );
}
