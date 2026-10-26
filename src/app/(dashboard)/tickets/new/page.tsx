import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listEvents } from "@/server/services/events.service";
import { BatchForm } from "@/components/tickets/batch-form";

export const instant = false;

export default async function NewBatchPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "inventory:generate")) redirect("/tickets");

  const events = await listEvents(ctx);
  // Completed/archived events cannot generate stock (PRD 7.5).
  const generatable = events.filter(
    (event) => event.status !== "COMPLETED" && event.status !== "ARCHIVED",
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to inventory
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Generate tickets
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Serials and secure QR tokens are created in one transaction — either
          the whole batch exists or none of it does.
        </p>
      </div>
      <BatchForm
        events={generatable.map((event) => ({
          id: event.id,
          name: event.name,
          status: event.status,
        }))}
      />
    </div>
  );
}
