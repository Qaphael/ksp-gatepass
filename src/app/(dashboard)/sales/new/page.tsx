import { redirect } from "next/navigation";
import { SaleCreateForm } from "@/components/sales/sale-create-form";
import { ScanToSell } from "@/components/sales/scan-to-sell";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listEvents } from "@/server/services/events.service";
import { listTicketTypes } from "@/server/services/ticket-types.service";
import { InstallHint } from "@/components/pwa/install-hint";

export const instant = false;

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "sale:create")) redirect("/sales");
  const events = await listEvents(ctx);
  const requestedId = (await searchParams).eventId;
  const selected = events.find((event) => event.id === requestedId) ?? events[0];
  if (ctx.role === "SELLER") return <div className="mx-auto flex max-w-3xl flex-col gap-4"><InstallHint role="seller" /><ScanToSell events={events.map((event) => ({ id: event.id, name: event.name, requireBuyerDetails: event.requireBuyerDetails, requireFullPaymentAtSale: event.requireFullPaymentAtSale, allowSellerManualSale: event.allowSellerManualSale, buyerNoticeText: event.buyerNoticeText }))} initialEventId={selected?.id} /></div>;
  const initialTypes = selected ? await listTicketTypes(ctx, selected.id) : [];
  return <div className="mx-auto flex max-w-3xl flex-col gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Create sale</h1><p className="mt-1 text-sm text-muted-foreground">Select event tickets, review the server priced total and record any confirmed payment.</p></div><SaleCreateForm events={events} initialEventId={selected?.id} initialTypes={initialTypes} canDiscount={can(ctx.role, "sale:discount")} /></div>;
}
