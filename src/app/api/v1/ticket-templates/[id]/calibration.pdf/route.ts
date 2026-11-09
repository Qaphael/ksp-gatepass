import { apiHandler, pdfResponse } from "@/lib/api";
import { renderTicketTemplateCalibration } from "@/server/services/print.service";

export const GET = apiHandler(async (ctx, _req, params) => {
  const job = await renderTicketTemplateCalibration(ctx, params.id);
  const response = pdfResponse(job.pdf, job.filename);
  response.headers.set("X-Print-Batch-Id", job.printBatchId);
  return response;
});
