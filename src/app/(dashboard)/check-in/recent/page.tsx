import { redirect } from "next/navigation";
import { CorrectionButton } from "@/components/check-in/correction-button";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { checkInListQuerySchema } from "@/lib/validation/check-in";
import { listEvents } from "@/server/services/events.service";
import { getAttendanceSummary, listRecentCheckIns } from "@/server/services/check-in.service";

export const instant = false;
const date = (value: string) => new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(value));
export default async function RecentCheckInsPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login");
  if (!can(ctx.role, "checkin:read-recent")) redirect("/dashboard");
  const [events, params] = await Promise.all([listEvents(ctx), searchParams]);
  const event = events.find((item) => item.id === params.eventId) ?? events[0];
  const data = event ? checkInListQuerySchema.parse({ eventId: event.id, limit: 100 }) : null;
  const [summary, rows] = data ? await Promise.all([getAttendanceSummary(ctx, event!.id), listRecentCheckIns(ctx, data)]) : [null, []];
  return <div className="flex flex-col gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Attendance</h1><p className="mt-1 text-sm text-muted-foreground">Recent admissions and event attendance totals.</p></div>{events.length > 0 && <form className="flex max-w-xl items-end gap-2"><label className="grid flex-1 gap-1 text-sm">Event<select name="eventId" defaultValue={event?.id ?? ""} className="rounded-md border border-input bg-background px-3 py-2">{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="rounded-md border px-3 py-2 text-sm">Select</button></form>}{summary && <div className="grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">{[["Checked in", summary.checkedIn], ["Tickets sold", summary.ticketsSold], ["Awaiting", summary.notYetCheckedIn], ["Capacity", summary.capacity]].map(([label, value]) => <div className="rounded-lg border p-3" key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</div>}<div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr>{["Ticket", "Category", "Gate", "Checked in", "Verifier", "History"].map((x) => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2 font-medium">{row.serial}</td><td className="px-3 py-2">{row.ticketTypeName}</td><td className="px-3 py-2">{row.gate}</td><td className="px-3 py-2">{date(row.checkedInAt)}</td><td className="px-3 py-2">{row.verifier.displayName}</td><td className="px-3 py-2">{row.corrections.map((c) => <p key={c.id} title={c.actorName}>{c.reason} · {date(c.createdAt)}</p>)}{can(ctx.role, "checkin:override") && <CorrectionButton checkInId={row.id} />}</td></tr>)}{rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No check-ins recorded yet.</td></tr>}</tbody></table></div></div>;
}
