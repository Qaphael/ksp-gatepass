import { z } from "zod";
import { apiHandler, pdfResponse } from "@/lib/api";
import { renderTicketTemplateCalibration } from "@/server/services/print.service";

const calibrationQuerySchema = z.object({
  ticketTypeId: z.string().trim().min(1).max(128).optional(),
}).strict();

export const GET = apiHandler(async (ctx, req, params) => {
  const query = calibrationQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const job = await renderTicketTemplateCalibration(ctx, params.id, query.ticketTypeId);
  const response = pdfResponse(job.pdf, job.filename);
  response.headers.set("X-Print-Batch-Id", job.printBatchId);
  return response;
});
