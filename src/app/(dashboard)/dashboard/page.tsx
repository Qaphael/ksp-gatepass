import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, CalendarClock, Lock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OpenBadge, StatusBadge } from "@/components/events/status-badges";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/role";
import { listEvents } from "@/server/services/events.service";
import { listUsers } from "@/server/services/users.service";

export const instant = false;

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (ctx.role === "VERIFIER") redirect("/scanner");
  if (ctx.role === "SELLER") redirect("/sales/new");

  const events = await listEvents(ctx);
  const isAdmin = can(ctx.role, "user:manage");
  const users = isAdmin ? await listUsers(ctx) : [];

  const scheduled = events.filter((event) => event.status === "SCHEDULED");
  const salesOpen = events.filter((event) => event.salesOpen);
  const activeUsers = users.filter((user) => user.active);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {ctx.displayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {ROLE_LABELS[ctx.role]} · @{ctx.username}
          </p>
        </div>
        {can(ctx.role, "event:create") ? (
          <Button nativeButton={false} render={<Link href="/events/new" />}>
            Create event <ArrowRight />
          </Button>
        ) : null}
      </div>

      {isAdmin ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<CalendarDays />}
            label="Events"
            value={String(events.length)}
          />
          <StatCard
            icon={<CalendarClock />}
            label="Scheduled"
            value={String(scheduled.length)}
          />
          <StatCard
            icon={<Lock />}
            label="Sales open"
            value={String(salesOpen.length)}
          />
          <StatCard
            icon={<Users />}
            label="Active staff"
            value={String(activeUsers.length)}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {events.length === 0
              ? "No events have been configured yet."
              : "Current event workspaces and their operational state."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                {can(ctx.role, "event:create")
                  ? "Create your first event to configure dates, capacity and admission policy."
                  : "An administrator has not configured an event yet."}
              </p>
              {can(ctx.role, "event:create") ? (
                <Button nativeButton={false} variant="outline" render={<Link href="/events/new" />}>
                  Create event <ArrowRight />
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/events/${event.id}`}
                      className="font-medium hover:underline"
                    >
                      {event.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {event.eventDate} · {event.startTime}–{event.endTime} ·{" "}
                      {event.venue}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={event.status} />
                    <OpenBadge open={event.salesOpen} label="Sales" />
                    <OpenBadge open={event.admissionOpen} label="Admission" />
                    <Badge variant="outline">
                      cap {event.capacity}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <p className="text-xl font-semibold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
