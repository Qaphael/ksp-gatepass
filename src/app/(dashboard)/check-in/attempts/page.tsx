import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { scanAttemptQuerySchema } from "@/lib/validation/check-in";
import { listEvents } from "@/server/services/events.service";
import { listScanAttempts } from "@/server/services/check-in.service";

export const instant = false;
export default async function ScanAttemptsPage({ searchParams }: { searchParams: Promise<{ eventId?: string; method?: string; resultCode?: string }> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login");
  if (!can(ctx.role, "checkin:read-attempts")) redirect("/dashboard");
  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === params.eventId) ?? events[0];
  const parsed = event ? scanAttemptQuerySchema.safeParse({ eventId: event.id, method: params.method, resultCode: params.resultCode, limit: 100 }) : null;
  const rows = parsed?.success ? await listScanAttempts(ctx, parsed.data) : [];
  return <div className="flex flex-col gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Scan attempts</h1><p className="mt-1 text-sm text-muted-foreground">Recent verification outcomes. QR token values are never stored.</p></div>{event && <form className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-sm">Event<select name="eventId" defaultValue={event.id} className="rounded-md border border-input bg-background px-3 py-2">{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-sm">Method<select name="method" defaultValue={params.method ?? ""} className="rounded-md border border-input bg-background px-3 py-2"><option value="">All</option><option value="QR">QR</option><option value="SERIAL">Serial</option></select></label><label className="grid gap-1 text-sm">Result<select name="resultCode" defaultValue={params.resultCode ?? ""} className="rounded-md border border-input bg-background px-3 py-2"><option value="">All</option>{["INVALID_QR", "UNKNOWN_SERIAL", "NOT_PAID", "TICKET_REVOKED", "ALREADY_USED", "ADMITTED", "ELIGIBLE"].map((code) => <option key={code}>{code}</option>)}</select></label><button className="rounded-md border px-3 py-2 text-sm">Filter</button></form>}<div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr>{["Time", "Method", "Ticket", "Gate", "Result", "Staff"].map((x) => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2">{new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(row.attemptedAt))}</td><td className="px-3 py-2">{row.method}</td><td className="px-3 py-2">{row.serial ?? "Unknown"}</td><td className="px-3 py-2">{row.gate ?? "—"}</td><td className="px-3 py-2">{row.resultCode}</td><td className="px-3 py-2">{row.actor.displayName}</td></tr>)}{rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No attempts found.</td></tr>}</tbody></table></div></div>;
}
