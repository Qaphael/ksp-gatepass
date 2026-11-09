import { apiHandler, pdfResponse } from "@/lib/api";
import { renderTicketTemplateCalibration } from "@/server/services/print.service";

export const GET = apiHandler(async (ctx, _req, params) => {
  const job = await renderTicketTemplateCalibration(ctx, params.id);
  return pdfResponse(job.pdf, job.filename);
});
