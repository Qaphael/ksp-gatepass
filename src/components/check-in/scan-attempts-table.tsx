"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTable, type ColumnDef } from "@tanstack/react-table";
import { ScanSearchIcon } from "lucide-react";
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
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
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Serial } from "@/components/ui/serial";
import { StatusBadge } from "@/components/ui/status-badge";

export interface ScanAttemptRow {
  id: string;
  attemptedAt: string;
  method: string;
  serial: string | null;
  gate: string | null;
  resultCode: string;
  actorName: string;
}

const formatWhen = (value: string) =>
  new Intl.DateTimeFormat("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala",
  }).format(new Date(value));

export function ScanAttemptsTable({
  rows,
  nextCursorUrl,
}: {
  rows: ScanAttemptRow[];
  nextCursorUrl: string | null;
}) {
  const columns = useMemo<ColumnDef<DataGridFeatures, ScanAttemptRow>[]>(
    () => [
      {
        accessorKey: "attemptedAt",
        header: ({ column }) => <DataGridColumnHeader title="Time" column={column} />,
        cell: ({ row }) => (
          <time className="text-muted-foreground whitespace-nowrap font-mono text-xs">
            {formatWhen(row.original.attemptedAt)}
          </time>
        ),
        meta: { headerTitle: "Time" },
      },
      {
        accessorKey: "method",
        header: ({ column }) => <DataGridColumnHeader title="Method" column={column} />,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.method}</span>,
        meta: { headerTitle: "Method" },
      },
      {
        accessorKey: "serial",
        header: ({ column }) => <DataGridColumnHeader title="Ticket" column={column} />,
        cell: ({ row }) =>
          row.original.serial ? (
            <Serial className="font-semibold">{row.original.serial}</Serial>
          ) : (
            <span className="text-muted-foreground text-xs">Unknown</span>
          ),
        meta: { headerTitle: "Ticket" },
      },
      {
        accessorKey: "gate",
        header: ({ column }) => <DataGridColumnHeader title="Gate" column={column} />,
        cell: ({ row }) => <span className="text-sm">{row.original.gate ?? "—"}</span>,
        meta: { headerTitle: "Gate" },
      },
      {
        accessorKey: "resultCode",
        header: ({ column }) => <DataGridColumnHeader title="Result" column={column} />,
        cell: ({ row }) => (
          <StatusBadge
            domain="scan"
            status={row.original.resultCode as Parameters<typeof StatusBadge>[0]["status"]}
          />
        ),
        meta: { headerTitle: "Result" },
      },
      {
        accessorKey: "actorName",
        header: ({ column }) => <DataGridColumnHeader title="Staff" column={column} />,
        cell: ({ row }) => <span className="text-sm">{row.original.actorName}</span>,
        meta: { headerTitle: "Staff" },
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    data: rows,
    columns,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 25 },
    },
  });

  if (rows.length === 0) {
    return (
      <Frame spacing="default">
        <FramePanel>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScanSearchIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No scan attempts</EmptyTitle>
              <EmptyDescription>No scan attempts match these filters.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <DataGrid
      table={table}
      recordCount={rows.length}
      tableLayout={{ dense: true, rowBorder: true, headerBackground: true }}
      tableClassNames={{ base: "min-w-[720px]" }}
    >
      <Frame spacing="default">
        <FrameHeader>
          <FrameTitle>Attempt log</FrameTitle>
          <FrameDescription>
            {rows.length} {rows.length === 1 ? "attempt" : "attempts"}
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="p-0">
          <DataGridScrollArea orientation="horizontal">
            <DataGridTable />
          </DataGridScrollArea>
        </FramePanel>
        <FrameFooter>
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <DataGridPagination />
            {nextCursorUrl ? (
              <Button nativeButton={false} variant="outline" size="sm" render={<Link href={nextCursorUrl} />}>
                Load older
              </Button>
            ) : null}
          </div>
        </FrameFooter>
      </Frame>
    </DataGrid>
  );
}
