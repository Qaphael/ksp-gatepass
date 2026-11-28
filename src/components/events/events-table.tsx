"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Frame,
  FramePanel,
} from "@/components/reui/frame";
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import { StateChip, StatusBadge } from "@/components/events/status-badges";
import type { EventDto } from "@/server/services/events.service";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { formatEventTimeRange } from "@/lib/time";

type FilterValue =
  | "all"
  | "draft"
  | "scheduled"
  | "sales-open"
  | "sales-closed"
  | "completed"
  | "archived";

const FILTER_OPTIONS: Array<{ value: FilterValue; label: string }> = [
  { value: "all", label: "All events" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sales-open", label: "Open for sales" },
  { value: "sales-closed", label: "Sales closed" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

function matchesFilter(event: EventDto, filter: FilterValue): boolean {
  switch (filter) {
    case "all":
      return true;
    case "draft":
      return event.status === "DRAFT";
    case "scheduled":
      return event.status === "SCHEDULED";
    case "sales-open":
      return event.salesOpen;
    case "sales-closed":
      return !event.salesOpen;
    case "completed":
      return event.status === "COMPLETED";
    case "archived":
      return event.status === "ARCHIVED";
  }
}

export function EventsTable({
  events,
  canCreate = false,
}: {
  events: EventDto[];
  /** Only affects the empty-state call to action; access is still enforced on the server. */
  canCreate?: boolean;
}) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const filtered = useMemo(
    () => events.filter((event) => matchesFilter(event, filter)),
    [events, filter],
  );

  const columns = useMemo<ColumnDef<DataGridFeatures, EventDto>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Event",
        size: 220,
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/events/${row.original.id}`} className="font-medium hover:underline">
              {row.original.name}
            </Link>
            <p className="truncate text-xs font-normal text-muted-foreground">{row.original.venue}</p>
          </div>
        ),
      },
      {
        accessorKey: "eventDate",
        header: "Date",
        size: 170,
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            {row.original.eventDate}
            <p className="text-xs text-muted-foreground">
              {formatEventTimeRange(row.original.startTime, row.original.endTime)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "windows",
        header: "Windows",
        size: 190,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StateChip open={row.original.salesOpen} label="Sales" />
            <StateChip open={row.original.admissionOpen} label="Admission" />
          </div>
        ),
      },
      {
        accessorKey: "capacity",
        header: "Capacity",
        size: 100,
        meta: { headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
      },
      {
        id: "manage",
        header: "",
        size: 100,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
        cell: ({ row }) => (
          <Link href={`/events/${row.original.id}`} className="text-sm underline underline-offset-2">
            Manage
          </Link>
        ),
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filtered,
    getRowId: (event) => event.id,
  });

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
          <p>
            {canCreate
              ? "No events yet. Create one to configure dates, capacity and sales windows."
              : "No events have been configured yet. An administrator creates the first event."}
          </p>
          {canCreate ? (
            <Link
              href="/events/new"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-4" aria-hidden="true" />
              Create event
            </Link>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FilterSheet activeCount={filter === "all" ? 0 : 1}><div className="flex items-center gap-2 rounded-lg border p-3">
        <Select
          value={filter}
          onValueChange={(value) => {
            if (value) setFilter(value as FilterValue);
          }}
        >
          <SelectTrigger className="w-full md:w-48" aria-label="Filter events">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="shrink-0 text-sm text-muted-foreground">
          {filtered.length} of {events.length}
        </span>
      </div></FilterSheet>

      <ResponsiveList cards={filtered.map((event) => <EventCard key={event.id} event={event} />)} table={
        <DataGrid
          table={table}
          recordCount={filtered.length}
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
      } />
      {filtered.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><p className="text-base">No events match this filter.</p><button type="button" className="mt-2 inline-flex min-h-11 items-center underline" onClick={() => setFilter("all")}>Show all events</button></div>}
    </div>
  );
}

/** Phone card: name, date, venue, state chips and capacity. The whole card is the tap target. */
function EventCard({ event }: { event: EventDto }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card transition-colors active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 truncate text-base font-semibold">{event.name}</p>
        <StatusBadge status={event.status} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 text-sm text-muted-foreground">
        <p className="flex min-w-0 items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{event.eventDate} · {formatEventTimeRange(event.startTime, event.endTime)}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{event.venue}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StateChip open={event.salesOpen} label="Sales" />
        <StateChip open={event.admissionOpen} label="Admission" />
        <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
          <span className="text-foreground tabular-nums">{event.capacity}</span>&nbsp;capacity
        </span>
      </div>
    </Link>
  );
}
