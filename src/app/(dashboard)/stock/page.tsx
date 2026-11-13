import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { listEvents } from "@/server/services/events.service";
import { getSellerStockStatement } from "@/server/services/stock.service";
import { StockWorkspace } from "@/components/stock/stock-workspace";
import { PageHeader } from "@/components/ui/page-header";

export const instant = false;
type Search=Record<string,string|string[]|undefined>;
export default async function StockPage({searchParams}:{searchParams:Promise<Search>}) {
 const ctx=await getSessionContext(); if(!ctx) redirect("/login");
 const own=can(ctx.role,"stock:read-own")&&!can(ctx.role,"stock:read-all");
 if(!can(ctx.role,"stock:read-own")&&!can(ctx.role,"stock:read-all")) redirect("/dashboard");
 const [events,params]=await Promise.all([listEvents(ctx),searchParams]); const requested=typeof params.eventId==="string"?params.eventId:""; const event=events.find(e=>e.id===requested)??events[0];
 if(!event) return <div className="grid gap-4"><PageHeader title={own?"My stock":"Seller stock"} description="Issued tickets, handovers and seller reconciliation." /><p className="rounded-lg border border-dashed p-6 text-base">No event is available yet.</p></div>;
 const [sellers,staff,statement,remittances,ticketTypes]=await Promise.all([
  own?Promise.resolve([]):prisma.user.findMany({where:{role:"SELLER",active:true},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),
  own?Promise.resolve([]):prisma.$queryRaw<Array<{id:string;displayName:string}>>`
   SELECT "id", "displayName"
   FROM "User"
   WHERE "active" = true AND "role"::text IN ('ADMIN', 'SUPER_ADMIN', 'SUPERVISOR')
   ORDER BY "displayName" ASC
  `,
  own?getSellerStockStatement(ctx,ctx.userId,{eventId:event.id}):Promise.resolve(null),
  own?Promise.resolve([]):prisma.remittance.findMany({where:{eventId:event.id},include:{seller:{select:{displayName:true}},reversal:{select:{id:true}}},orderBy:{recordedAt:"desc"},take:100}),
  can(ctx.role,"stock:manage")?prisma.ticketType.findMany({where:{eventId:event.id,status:"ACTIVE"},select:{id:true,name:true},orderBy:{name:"asc"}}):Promise.resolve([]),
 ]);
 return <div className="grid gap-5"><PageHeader title={own?"My stock":"Seller stock"} description="Issued tickets, handovers and seller reconciliation." /><StockWorkspace eventId={event.id} events={events.map(({id,name})=>({id,name}))} sellers={own?[{id:ctx.userId,displayName:ctx.displayName}]:sellers} staff={staff} ticketTypes={ticketTypes} ownSellerId={own?ctx.userId:undefined} canManage={can(ctx.role,"stock:manage")} canRemit={can(ctx.role,"remittance:record")&&can(ctx.role,"remittance:reverse")} initialStatement={statement} remittances={remittances.map(r=>({...r,recordedAt:r.recordedAt.toISOString()}))}/></div>;
}
