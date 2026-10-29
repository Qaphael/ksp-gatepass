"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function EventSwitcher({ events }: { events: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeEventId = pathname.match(/^\/events\/([^/]+)$/)?.[1];
  const selectedEventId = searchParams.get("eventId") ?? (routeEventId ? decodeURIComponent(routeEventId) : "");
  const value = events.some((event) => event.id === selectedEventId) ? selectedEventId : null;

  return (
    <Select
      items={events.map((event) => ({ value: event.id, label: event.name }))}
      value={value}
      onValueChange={(eventId) => {
        if (!eventId) return;
        router.push(pathname === "/dashboard" ? `/dashboard?eventId=${encodeURIComponent(eventId)}` : `/events/${encodeURIComponent(eventId)}`);
      }}
    >
      <SelectTrigger
        aria-label="Choose event"
        size="sm"
        className="h-11 min-h-11 w-[min(44vw,15rem)] min-w-0 max-w-[15rem] justify-start gap-2 rounded-full px-3 text-sm font-medium"
      >
        <CalendarDays className="size-4 text-primary" aria-hidden="true" />
        <SelectValue placeholder="Select event" className="truncate" />
      </SelectTrigger>
      <SelectContent align="start">
        {events.map((event) => (
          <SelectItem key={event.id} value={event.id}>
            {event.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
