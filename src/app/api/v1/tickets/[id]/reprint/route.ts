import { apiHandler, pdfResponse } from "@/lib/api";
import { printTicket } from "@/server/services/print.service";

/** PRD 10.3: "Record and generate authorised reprint". First-time single
 * prints take this path too; the service decides PRODUCTION vs REPRINT and
 * demands `ticket:reprint` only for genuine reprints (same token, rule 8). */
export const POST = apiHandler(async (ctx, _req, params) => {
  const job = await printTicket(ctx, params.id);
  return pdfResponse(job.pdf, job.filename);
});
