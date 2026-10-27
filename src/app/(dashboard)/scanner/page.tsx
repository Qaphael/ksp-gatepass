import { redirect } from "next/navigation";
import { CheckInScanner } from "@/components/check-in/scanner";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listEvents } from "@/server/services/events.service";

export const instant = false;
export default async function ScannerPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login");
  if (!can(ctx.role, "checkin:verify")) redirect("/dashboard");
  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === params.eventId) ?? events[0];
  return <div className="flex flex-col gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Check-in</h1><p className="mt-1 text-sm text-muted-foreground">Scan a QR ticket and confirm admission with the server.</p></div>{events.length ? <form className="flex max-w-xl items-end gap-2"><label className="grid flex-1 gap-1 text-sm">Event<select name="eventId" defaultValue={event?.id ?? ""} className="rounded-md border border-input bg-background px-3 py-2">{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="rounded-md border px-3 py-2 text-sm">Select</button></form> : <p>No events are available.</p>}{event && <CheckInScanner key={event.id} eventId={event.id} eventName={event.name} />}</div>;
}
