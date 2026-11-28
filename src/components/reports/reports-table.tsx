"use client";

import { useMemo } from "react";
import { useTable, type ColumnDef } from "@tanstack/react-table";
import { FileBarChartIcon } from "lucide-react";
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
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
  FrameDescription,
} from "@/components/reui/frame";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Money } from "@/components/ui/money";

export type ReportCell = string | number | null;

type ReportRowRecord = Record<string, ReportCell>;

function isMoneyCell(value: ReportCell | undefined, column: string): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && /UGX/i.test(column);
}

function isNumericColumn(column: string, rows: ReportCell[][], colIndex: number): boolean {
  if (/UGX|count|total|sold|qty|quantity|percent|%/i.test(column)) return true;
  return rows.some((row) => typeof row[colIndex] === "number");
}

export function ReportsTable({
  title,
  eventName,
  columns,
  rows,
}: {
  title: string;
  eventName: string;
  columns: string[];
  rows: ReportCell[][];
}) {
  const data = useMemo<ReportRowRecord[]>(
    () =>
      rows.map((row) => {
        const record: ReportRowRecord = {};
        columns.forEach((col, index) => {
          record[`col_${index}`] = row[index] ?? null;
        });
        return record;
      }),
    [columns, rows],
  );

  const columnDefs = useMemo<ColumnDef<DataGridFeatures, ReportRowRecord>[]>(
    () =>
      columns.map((column, index) => {
        const numeric = isNumericColumn(column, rows, index);
        return {
          id: `col_${index}`,
          accessorFn: (row) => row[`col_${index}`],
          header: ({ column: tableColumn }) => (
            <DataGridColumnHeader title={column} column={tableColumn} />
          ),
          cell: ({ row }) => {
            const value = row.original[`col_${index}`];
            if (isMoneyCell(value, column)) {
              return <Money amount={value} />;
            }
            return (
              <span className={numeric ? "tabular-nums" : undefined}>
                {value === null || value === undefined || value === "" ? "—" : String(value)}
              </span>
            );
          },
          meta: {
            headerTitle: column,
            ...(numeric
              ? {
                  headerClassName: "text-end [&>div]:justify-end",
                  cellClassName: "text-end tabular-nums",
                }
              : {}),
          },
        };
      }),
    [columns, rows],
  );

  const table = useTable({
    features: dataGridFeatures,
    data,
    columns: columnDefs,
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
                <FileBarChartIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No matching records</EmptyTitle>
              <EmptyDescription>
                Adjust the event or date filters above and run the report again.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <DataGrid
      table={table}
      recordCount={data.length}
      tableLayout={{ dense: true, rowBorder: true, headerBackground: true }}
      tableClassNames={{ base: "min-w-[720px]" }}
    >
      <Frame spacing="default">
        <FrameHeader>
          <FrameTitle>{title}</FrameTitle>
          <FrameDescription>
            {eventName} · {data.length} {data.length === 1 ? "row" : "rows"}
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="p-0">
          <DataGridScrollArea orientation="horizontal">
            <DataGridTable />
          </DataGridScrollArea>
        </FramePanel>
        <FrameFooter>
          <DataGridPagination />
        </FrameFooter>
      </Frame>
    </DataGrid>
  );
}
