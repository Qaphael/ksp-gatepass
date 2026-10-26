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
      <div className="flex items-center gap-2">
        <Select
          value={filter}
          onValueChange={(value) => {
            if (value) setFilter(value as FilterValue);
          }}
        >
          <SelectTrigger className="w-48" aria-label="Filter events">
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
      </div>

      <Card>
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
                      {event.startTime}–{event.endTime}
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
      </Card>
    </div>
  );
}
