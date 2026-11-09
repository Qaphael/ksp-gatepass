import { apiHandler, pdfResponse } from "@/lib/api";
import { reprintBatchOutput } from "@/server/services/print.service";

export const POST = apiHandler(async (ctx, _req, params) => {
  const job = await reprintBatchOutput(ctx, params.id);
  return pdfResponse(job.pdf, job.filename);
});
