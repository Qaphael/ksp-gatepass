import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EventForm } from "@/components/events/event-form";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export const instant = false;

export default async function NewEventPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "event:create")) redirect("/events");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to events
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create event</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dates, capacity and admission policy can be adjusted later — changes
          are recorded in the audit log.
        </p>
      </div>
      <EventForm mode="create" />
    </div>
  );
}
