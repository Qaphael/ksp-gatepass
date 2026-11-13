import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TicketTemplateManager } from "@/components/tickets/ticket-template-manager";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ServiceError } from "@/lib/api";
import { getEvent } from "@/server/services/events.service";
import { listTicketTemplates } from "@/server/services/ticket-templates.service";
import { listTicketTypes } from "@/server/services/ticket-types.service";
import { PageHeader } from "@/components/ui/page-header";

export const instant = false;

export default async function TicketTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "template:manage")) redirect("/dashboard");
  const { id } = await params;
  let event;
  let templates;
  let ticketTypes;
  try {
    [event, templates, ticketTypes] = await Promise.all([getEvent(ctx, id), listTicketTemplates(ctx, id), listTicketTypes(ctx, id)]);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }
  return <div className="flex flex-col gap-5">
    <Link href={`/events/${id}`} className="inline-flex min-h-11 items-center gap-2 text-base text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to event</Link>
    <PageHeader title="Ticket templates" description={`${event.name} · Upload the artwork, set measured print zones, and review a sample before activation.`} />
    <TicketTemplateManager eventId={id} initialTemplates={templates.map((template) => ({ ...template, confirmedAt: template.confirmedAt?.toISOString() ?? null, calibrationPrintedAt: template.calibrationPrintedAt?.toISOString() ?? null, createdAt: template.createdAt.toISOString() }))} ticketTypes={ticketTypes.map(({ id: ticketTypeId, name, color }) => ({ id: ticketTypeId, name, color }))} />
  </div>;
}
