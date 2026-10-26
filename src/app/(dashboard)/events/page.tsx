import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listEvents } from "@/server/services/events.service";
import { EventsTable } from "@/components/events/events-table";

export const instant = false;

export default async function EventsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "event:read")) redirect("/dashboard");

  const events = await listEvents(ctx);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure dates, capacity, sales and admission windows.
          </p>
        </div>
        {can(ctx.role, "event:create") ? (
          <Button render={<Link href="/events/new" />}>
            <Plus /> Create event
          </Button>
        ) : null}
      </div>

      <EventsTable events={events} />
    </div>
  );
}
