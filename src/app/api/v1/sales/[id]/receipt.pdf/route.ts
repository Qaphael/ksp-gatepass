import { apiHandler, pdfResponse } from "@/lib/api";
import { renderReceiptPdf } from "@/lib/pdf/receipt";
import { getSaleForReceipt } from "@/server/services/sales.service";

export const GET = apiHandler(async (ctx, _req, { id }: { id: string }) => {
  const sale = await getSaleForReceipt(ctx, id);
  return pdfResponse(await renderReceiptPdf(sale), `receipt-${sale.reference}.pdf`);
});
