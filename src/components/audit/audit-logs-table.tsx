"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTable, type ColumnDef } from "@tanstack/react-table";
import { EyeIcon, ScrollTextIcon } from "lucide-react";
import { Badge } from "@/components/reui/badge";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export interface AuditLogRow {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorRole: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  eventName: string | null;
  outcome: "SUCCESS" | "FAILURE";
  summary: unknown;
}

const formatWhen = (value: string) =>
  new Intl.DateTimeFormat("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala",
  }).format(new Date(value));

export function AuditLogsTable({
  logs,
  total,
  page,
  pages,
  prevUrl,
  nextUrl,
}: {
  logs: AuditLogRow[];
  total: number;
  page: number;
  pages: number;
  prevUrl: string | null;
  nextUrl: string | null;
}) {
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const columns = useMemo<ColumnDef<DataGridFeatures, AuditLogRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: ({ column }) => <DataGridColumnHeader title="Time" column={column} />,
        cell: ({ row }) => (
          <time className="text-muted-foreground whitespace-nowrap font-mono text-xs">
            {formatWhen(row.original.createdAt)}
          </time>
        ),
        meta: { headerTitle: "Time" },
      },
      {
        accessorKey: "actorName",
        header: ({ column }) => <DataGridColumnHeader title="Actor" column={column} />,
        cell: ({ row }) => {
          const entry = row.original;
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">
                {entry.actorName ?? (entry.actorId ? "Inactive account" : "Unauthenticated")}
              </span>
              <span className="text-muted-foreground text-xs">{entry.actorRole ?? "No role"}</span>
            </div>
          );
        },
        meta: { headerTitle: "Actor" },
      },
      {
        accessorKey: "action",
        header: ({ column }) => <DataGridColumnHeader title="Action" column={column} />,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">
              {row.original.action.replaceAll("_", " ")}
            </span>
            <span className="text-muted-foreground font-mono text-xs">{row.original.action}</span>
          </div>
        ),
        meta: { headerTitle: "Action" },
      },
      {
        accessorKey: "targetType",
        header: ({ column }) => <DataGridColumnHeader title="Target" column={column} />,
        cell: ({ row }) => {
          const entry = row.original;
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm">{entry.targetType ?? "No target"}</span>
              <span className="text-muted-foreground truncate text-xs">
                {entry.eventName ?? "No event"}
              </span>
            </div>
          );
        },
        meta: { headerTitle: "Target" },
      },
      {
        accessorKey: "outcome",
        header: ({ column }) => <DataGridColumnHeader title="Outcome" column={column} />,
        cell: ({ row }) => (
          <Badge variant={row.original.outcome === "SUCCESS" ? "success-light" : "destructive-light"}>
            {row.original.outcome === "SUCCESS" ? "Success" : "Failure"}
          </Badge>
        ),
        meta: { headerTitle: "Outcome" },
      },
      {
        id: "summary",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(row.original)}
            >
              <EyeIcon aria-hidden="true" />
              Details
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    data: logs,
    columns,
    manualPagination: true,
    rowCount: total,
  });

  if (logs.length === 0) {
    return (
      <Frame spacing="default">
        <FramePanel>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollTextIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No audit entries</EmptyTitle>
              <EmptyDescription>No recorded actions match the current filters.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/audit-logs" />}>
                Clear filters
              </Button>
            </EmptyContent>
          </Empty>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <>
      <DataGrid
        table={table}
        recordCount={total}
        tableLayout={{ dense: true, rowBorder: true, headerBackground: true }}
        tableClassNames={{ base: "min-w-[820px]" }}
      >
        <Frame spacing="default">
          <FrameHeader>
            <FrameTitle>Recorded events</FrameTitle>
            <FrameDescription>
              {total} entries · page {page} of {pages}
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
                {prevUrl ? (
                  <Button nativeButton={false} variant="outline" size="sm" render={<Link href={prevUrl} />}>
                    Previous
                  </Button>
                ) : null}
                {nextUrl ? (
                  <Button nativeButton={false} variant="outline" size="sm" render={<Link href={nextUrl} />}>
                    Next
                  </Button>
                ) : null}
              </div>
            </div>
          </FrameFooter>
        </Frame>
      </DataGrid>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.action.replaceAll("_", " ") ?? "Audit entry"}</DialogTitle>
            <DialogDescription>
              {selected ? `${formatWhen(selected.createdAt)} · ${selected.actorName ?? "System"}` : null}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={selected.outcome === "SUCCESS" ? "success-light" : "destructive-light"}>
                  {selected.outcome === "SUCCESS" ? "Success" : "Failure"}
                </Badge>
                {selected.targetId ? (
                  <span className="text-muted-foreground font-mono text-xs">
                    {selected.targetType}: {selected.targetId}
                  </span>
                ) : null}
              </div>
              <pre className="bg-muted max-h-72 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
                {selected.summary === null ? "No summary" : JSON.stringify(selected.summary, null, 2)}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
