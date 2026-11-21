import "dotenv/config";
import { prisma } from "../src/lib/db/client";

async function verify() {
  const event = await prisma.event.findFirst({
    where: { name: "[REHEARSAL ONLY] stock-opmode" },
    select: { id: true, name: true, status: true }
  });
  
  console.log("Event:", event);
  
  const ticketCount = await prisma.ticket.count();
  console.log("Ticket count:", ticketCount);
  
  const batchCount = await prisma.ticketBatch.count();
  console.log("Batch count:", batchCount);
  
  const custodyCount = await prisma.ticketCustody.count();
  console.log("TicketCustody count:", custodyCount);
  
  const saleCount = await prisma.sale.count();
  console.log("Sale count:", saleCount);
  
  const stockIssueCount = await prisma.stockIssue.count();
  console.log("StockIssue count:", stockIssueCount);
  
  const remittanceCount = await prisma.remittance.count();
  console.log("Remittance count:", remittanceCount);
  
  await prisma.$disconnect();
}
verify().catch(e => { console.error(e); process.exit(1); });