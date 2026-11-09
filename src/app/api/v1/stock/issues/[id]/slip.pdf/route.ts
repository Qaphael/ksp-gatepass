import { apiHandler, pdfResponse } from "@/lib/api";
import { renderStockIssueSlip } from "@/lib/pdf/stock-issue-slip";
import { getStockIssueSlip } from "@/server/services/stock.service";

export const GET = apiHandler(async (ctx, _req, { id }: { id: string }) => {
  const data = await getStockIssueSlip(ctx, id);
  return pdfResponse(await renderStockIssueSlip(data), `stock-issue-${data.reference}.pdf`);
});
