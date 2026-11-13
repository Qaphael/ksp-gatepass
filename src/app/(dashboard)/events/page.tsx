import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listEvents } from "@/server/services/events.service";
import { EventsTable } from "@/components/events/events-table";
import { PageHeader } from "@/components/ui/page-header";

export const instant = false;

export default async function EventsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "event:read")) redirect("/dashboard");

  const events = await listEvents(ctx);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Events" description="Configure dates, capacity, sales and admission windows." actions={can(ctx.role, "event:create") ? <Button nativeButton={false} render={<Link href="/events/new" />}><Plus /> Create event</Button> : undefined} />

      <EventsTable events={events} />
    </div>
  );
}
