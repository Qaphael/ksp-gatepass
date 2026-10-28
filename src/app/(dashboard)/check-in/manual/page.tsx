import { redirect } from "next/navigation";
import { CheckInScanner } from "@/components/check-in/scanner";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listEvents } from "@/server/services/events.service";

export const instant = false;
export default async function ManualCheckInPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login");
  if (!can(ctx.role, "checkin:verify")) redirect("/dashboard");
  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === params.eventId) ?? events[0];
  return event ? <CheckInScanner key={event.id} eventId={event.id} eventName={event.name} events={events.map(({ id, name }) => ({ id, name }))} mode="manual" /> : <div className="rounded-xl border border-dashed p-8 text-center"><h1 className="text-xl font-semibold">No events available</h1><p className="mt-2 text-base text-muted-foreground">Create or open an event before looking up tickets.</p></div>;
}
