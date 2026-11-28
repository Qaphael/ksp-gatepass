"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTable, type ColumnDef } from "@tanstack/react-table";
import { HistoryIcon } from "lucide-react";
import { CorrectionButton } from "@/components/check-in/correction-button";
import { Badge } from "@/components/reui/badge";
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

export interface RecentCheckInRow {
  id: string;
  serial: string;
  ticketTypeName: string;
  gate: string;
  checkedInAt: string;
  verifierName: string;
  corrections: Array<{
    id: string;
    reason: string;
    createdAt: string;
    actorName: string;
  }>;
}

const formatWhen = (value: string) =>
  new Intl.DateTimeFormat("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala",
  }).format(new Date(value));

export function RecentCheckInsTable({
  rows,
  canOverride,
  nextCursorUrl,
}: {
  rows: RecentCheckInRow[];
  canOverride: boolean;
  nextCursorUrl: string | null;
}) {
  const columns = useMemo<ColumnDef<DataGridFeatures, RecentCheckInRow>[]>(
    () => [
      {
        accessorKey: "serial",
        header: ({ column }) => <DataGridColumnHeader title="Ticket" column={column} />,
        cell: ({ row }) => <Serial className="font-semibold">{row.original.serial}</Serial>,
        meta: { headerTitle: "Ticket" },
      },
      {
        accessorKey: "ticketTypeName",
        header: ({ column }) => <DataGridColumnHeader title="Category" column={column} />,
        cell: ({ row }) => <Badge variant="outline">{row.original.ticketTypeName}</Badge>,
        meta: { headerTitle: "Category" },
      },
      {
        accessorKey: "gate",
        header: ({ column }) => <DataGridColumnHeader title="Gate" column={column} />,
        cell: ({ row }) => <span className="text-sm">{row.original.gate}</span>,
        meta: { headerTitle: "Gate" },
      },
      {
        accessorKey: "checkedInAt",
        header: ({ column }) => <DataGridColumnHeader title="Checked in" column={column} />,
        cell: ({ row }) => (
          <time className="text-muted-foreground whitespace-nowrap font-mono text-xs">
            {formatWhen(row.original.checkedInAt)}
          </time>
        ),
        meta: { headerTitle: "Checked in" },
      },
      {
        accessorKey: "verifierName",
        header: ({ column }) => <DataGridColumnHeader title="Verifier" column={column} />,
        cell: ({ row }) => <span className="text-sm">{row.original.verifierName}</span>,
        meta: { headerTitle: "Verifier" },
      },
      {
        id: "history",
        header: "History",
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1.5">
            {row.original.corrections.map((c) => (
              <span
                key={c.id}
                title={c.actorName}
                className="text-muted-foreground text-xs"
              >
                {c.reason} · {formatWhen(c.createdAt)}
              </span>
            ))}
            {canOverride ? <CorrectionButton checkInId={row.original.id} /> : null}
          </div>
        ),
      },
    ],
    [canOverride],
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
                <HistoryIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No check-ins yet</EmptyTitle>
              <EmptyDescription>No check-ins have been recorded in this range.</EmptyDescription>
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
          <FrameTitle>Admissions</FrameTitle>
          <FrameDescription>
            {rows.length} recent {rows.length === 1 ? "admission" : "admissions"}
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
