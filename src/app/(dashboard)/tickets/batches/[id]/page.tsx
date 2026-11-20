import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Tickets } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { ServiceError } from "@/lib/api";
import { getBatch } from "@/server/services/ticket-batches.service";
import { getBatchFlow } from "@/server/services/ticket-batches.service";
import { BatchPrintActions } from "@/components/tickets/batch-print-actions";
import { formatTimestamp } from "@/components/tickets/ticket-format";
import { listTicketTemplates } from "@/server/services/ticket-templates.service";
import { ticketTemplateConfigSchema } from "@/lib/validation/ticket-templates";
import { listTicketTypes } from "@/server/services/ticket-types.service";
import { formatUGX } from "@/components/ui/money";
import { StatTile } from "@/components/ui/stat-tile";
import { DefList, DefRow } from "@/components/ui/def-list";

export const instant = false;

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");

  const { id } = await params;
  let batch;
  try {
    batch = await getBatch(ctx, id);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }

  const [flow, templates, ticketTypes] = await Promise.all([
    getBatchFlow(ctx, batch.id),
    can(ctx.role, "template:manage") ? listTicketTemplates(ctx, batch.eventId) : Promise.resolve([]),
    listTicketTypes(ctx, batch.eventId),
  ]);

  const firstTicketType = ticketTypes.find((type) => type.id === batch.ticketTypeId);
  const grossValue = batch.quantity * (firstTicketType?.priceUgx ?? 0);

  const template = templates.find((item) => item.ticketTypeId === batch.ticketTypeId && item.status === "ACTIVE")
    ?? templates.find((item) => item.ticketTypeId === null && item.status === "ACTIVE");
  const templateConfig = template ? ticketTemplateConfigSchema.safeParse(template.config) : null;
  const canPrint = can(ctx.role, "ticket:print");

  const pct = (value: number) => flow.total ? Math.round((value / flow.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to inventory
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold">{batch.batchRef}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {batch.eventName} · {batch.ticketTypeName} · {batch.quantity} tickets
            {batch.label ? ` · ${batch.label}` : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={`/tickets?batchId=${batch.id}`} />}
        >
          <Tickets /> View tickets in this batch
        </Button>
      </div>

      {/* Spec tiles */}
      <section aria-label="Batch specification" className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Serial range" value={batch.serialRange} />
        <StatTile label="Quantity" value={String(batch.quantity)} />
        <StatTile label="Price per ticket" value={formatUGX(firstTicketType?.priceUgx ?? 0)} />
        <StatTile label="Gross value" value={formatUGX(grossValue)} sub={`${batch.quantity} × ${formatUGX(firstTicketType?.priceUgx ?? 0)}`} />
      </section>

      {/* Flow tiles */}
      <section aria-label="Batch flow" className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total" value={String(flow.total)} suffix="tickets" />
        <StatTile label="With sellers" value={String(flow.withSellers)} percent={pct(flow.withSellers)} sub="Issued to sellers" />
        <StatTile label="Unissued" value={String(flow.inVault)} percent={pct(flow.inVault)} sub="In vault" />
        <StatTile label="Checked in" value={String(flow.checkedIn)} percent={pct(flow.checkedIn)} sub="Admitted at gate" />
      </section>

      {/* Custody list */}
      {flow.custody && flow.custody.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Custody by seller</CardTitle>
            <CardDescription>
              Sellers currently holding unsold tickets from this batch.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DefList>
              {flow.custody.map((c) => (
                <DefRow key={c.sellerId} label={c.sellerName}>
                  <Link href={`/stock?eventId=${encodeURIComponent(batch.eventId)}`} className="text-sm font-medium text-primary hover:underline truncate min-w-0">
                    Held {c.held} · Sold {c.sold}
                  </Link>
                </DefRow>
              ))}
            </DefList>
          </CardContent>
        </Card>
      ) : null}

      {/* Print card */}
      <Card>
        <CardHeader>
          <CardTitle>Print template</CardTitle>
          <CardDescription>
            Active template and print actions for this batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {template ? (
                <>
                  <div className="flex items-start gap-1 text-sm">
                    <span className="font-medium">{template.name}</span>
                    <span className="text-muted-foreground text-[10px]">v{template.version}</span>
                  </div>
                  {template.zonesArePlaceholder ? (
                    <p className="mt-1 text-xs text-destructive">
                      Template zones are placeholders — calibration required before production print.
                    </p>
                  ) : null}
                  <div className="mt-1 text-xs text-muted-foreground">
                    Calibration sheet{" "}
                    {template.calibrationPrintedAt ? (
                      <>
                        printed{" "}
                        <span className="font-medium">{formatTimestamp(template.calibrationPrintedAt.toISOString())}</span>
                      </>
                    ) : (
                      <>
                        not printed{" "}
                        <span className="text-destructive font-medium">—</span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No active template for this ticket type.</div>
              )}
            </div>
          </div>
          <BatchPrintActions
            batchId={batch.id}
            eventId={batch.eventId}
            quantity={batch.quantity}
            canPrint={canPrint}
            canExport={can(ctx.role, "inventory:export")}
            templateReady={Boolean(template && templateConfig?.success && !template.zonesArePlaceholder)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
