"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OpenBadge, StatusBadge } from "@/components/events/status-badges";
import type { EventDto } from "@/server/services/events.service";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { StatusBadge as SharedStatusBadge } from "@/components/ui/status-badge";
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

export function EventsTable({ events }: { events: EventDto[] }) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const filtered = useMemo(
    () => events.filter((event) => matchesFilter(event, filter)),
    [events, filter],
  );

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          No events yet. {`Create one to get started.`}
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
        <span className="text-sm text-muted-foreground">
          {filtered.length} of {events.length}
        </span>
      </div></FilterSheet>

      <ResponsiveList cards={filtered.map((event) => <Link key={event.id} href={`/events/${event.id}`} className="block min-w-0 rounded-xl border bg-card p-4 active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-base font-semibold">{event.name}</p><SharedStatusBadge domain="event" status={event.status} /></div>
        <p className="mt-1 truncate text-sm text-muted-foreground">{event.venue}</p><p className="mt-3 text-sm">{event.eventDate} · {formatEventTimeRange(event.startTime, event.endTime)}</p>
        <div className="mt-3 flex flex-wrap gap-2"><OpenBadge open={event.salesOpen} label="Sales" /><OpenBadge open={event.admissionOpen} label="Admission" /></div>
        <p className="mt-3 text-sm text-muted-foreground">Capacity <span className="font-medium text-foreground tabular-nums">{event.capacity}</span></p>
      </Link>)} table={<Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Windows</TableHead>
                <TableHead className="text-right">Capacity</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium">
                    <Link href={`/events/${event.id}`} className="hover:underline">
                      {event.name}
                    </Link>
                    <p className="text-xs font-normal text-muted-foreground">
                      {event.venue}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {event.eventDate}
                    <p className="text-xs text-muted-foreground">
                    {formatEventTimeRange(event.startTime, event.endTime)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={event.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <OpenBadge open={event.salesOpen} label="Sales" />
                      <OpenBadge open={event.admissionOpen} label="Admission" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {event.capacity}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/events/${event.id}`}
                      className="text-sm underline underline-offset-2"
                    >
                      Manage
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>} />
      {filtered.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><p className="text-base">No events match this filter.</p><button type="button" className="mt-2 inline-flex min-h-11 items-center underline" onClick={() => setFilter("all")}>Show all events</button></div>}
    </div>
  );
}
