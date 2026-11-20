"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import { TICKET_STATUSES } from "@/lib/validation/tickets";

const ALL = "ALL";

interface EventOption {
  id: string;
  name: string;
}

interface TicketTypeOption {
  id: string;
  name: string;
}

interface InventoryFiltersProps {
  events: EventOption[];
  ticketTypes: TicketTypeOption[];
  initial: {
    eventId?: string;
    status?: string;
    ticketTypeId?: string;
    search?: string;
  };
}

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  SOLD: "Sold",
  CANCELLED: "Cancelled",
  REVOKED: "Revoked",
};

/**
 * Inventory search + filters (PRD 5.5). Server-rendered list pages get their
 * data from the URL, so applying filters just navigates with query params.
 */
export function InventoryFilters({ events, ticketTypes, initial }: InventoryFiltersProps) {
  const router = useRouter();
  const [eventId, setEventId] = useState(initial.eventId ?? ALL);
  const [status, setStatus] = useState(initial.status ?? ALL);
  const [ticketTypeId, setTicketTypeId] = useState(initial.ticketTypeId ?? ALL);
  const [search, setSearch] = useState(initial.search ?? "");
  const [types, setTypes] = useState<TicketTypeOption[]>(ticketTypes);
  const [loadingTypes, setLoadingTypes] = useState(false);

  async function onEventChange(value: string) {
    setEventId(value);
    setTicketTypeId(ALL);
    if (value === ALL) {
      setTypes([]);
      return;
    }
    setLoadingTypes(true);
    const result = await apiFetch<{ ticketTypes: TicketTypeOption[] }>(
      `/api/v1/events/${value}/ticket-types`,
    );
    setTypes(result.ok ? result.data.ticketTypes : []);
    setLoadingTypes(false);
  }

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (eventId !== ALL) params.set("eventId", eventId);
    if (status !== ALL) params.set("status", status);
    if (ticketTypeId !== ALL) params.set("ticketTypeId", ticketTypeId);
    if (search.trim() !== "") params.set("search", search.trim());
    params.set("page", "1");
    router.push(`/tickets?${params.toString()}`);
  }

  function clear() {
    setEventId(ALL);
    setStatus(ALL);
    setTicketTypeId(ALL);
    setSearch("");
    setTypes([]);
    router.push("/tickets");
  }

  return (
    <form
      onSubmit={apply}
      className="flex flex-col gap-3 md:rounded-lg md:border md:border-border md:bg-card md:p-4"
      noValidate
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
          <label htmlFor="ticket-search" className="text-sm font-medium text-muted-foreground">
            Serial search
          </label>
          <Input
            id="ticket-search"
            placeholder="KSP-00001"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">Event</span>
          <Select
            value={eventId}
            onValueChange={(value) => {
              if (value) void onEventChange(value);
            }}
          >
            <SelectTrigger aria-label="Filter by event" className="w-full min-w-0 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All events</SelectItem>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">Status</span>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value ?? ALL)}
          >
            <SelectTrigger aria-label="Filter by status" className="w-full min-w-0 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {TICKET_STATUSES.map((ticketStatus) => (
                <SelectItem key={ticketStatus} value={ticketStatus}>
                  {STATUS_LABELS[ticketStatus]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {eventId !== ALL ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">Category</span>
            <Select
              value={ticketTypeId}
              onValueChange={(value) => setTicketTypeId(value ?? ALL)}
              disabled={loadingTypes}
            >
              <SelectTrigger aria-label="Filter by category" className="w-full min-w-0 text-base">
                <SelectValue
                  placeholder={loadingTypes ? "Loading…" : "All categories"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {types.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="sm" className="min-h-12 text-base" onClick={clear}>
          Clear
        </Button>
        <Button type="submit" size="sm" className="min-h-12 gap-2 text-base">
          {loadingTypes ? <Loader2 className="animate-spin" /> : <Search />}
          Apply filters
        </Button>
      </div>
    </form>
  );
}
