"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown } from "lucide-react";

export function EventSwitcher({ events }: { events: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeEventId = pathname.match(/^\/events\/([^/]+)$/)?.[1];
  const selectedEventId = searchParams.get("eventId") ?? (routeEventId ? decodeURIComponent(routeEventId) : "");
  return <label className="relative inline-flex min-w-0 items-center">
    <span className="sr-only">Choose event</span>
    <CalendarDays className="pointer-events-none absolute left-3 size-4 text-primary" />
    <select aria-label="Choose event" value={events.some((event) => event.id === selectedEventId) ? selectedEventId : ""} onChange={(event) => { if (event.target.value) router.push(pathname === "/dashboard" ? `/dashboard?eventId=${encodeURIComponent(event.target.value)}` : `/events/${encodeURIComponent(event.target.value)}`); }} className="h-11 max-w-[min(44vw,15rem)] appearance-none truncate rounded-full border border-border bg-background py-2 pl-9 pr-9 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <option value="">Select event</option>
      {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />
  </label>;
}
