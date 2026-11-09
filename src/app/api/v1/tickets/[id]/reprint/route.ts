import { apiHandler, pdfResponse, requestQuery, ServiceError, ERROR_CODES } from "@/lib/api";
import { printTicket } from "@/server/services/print.service";
import { ticketSinglePrintQuerySchema } from "@/lib/validation/ticket-print";

/** PRD 10.3: "Record and generate authorised reprint". First-time single
 * prints take this path too; the service decides PRODUCTION vs REPRINT and
 * demands `ticket:reprint` only for genuine reprints (same token, rule 8). */
export const POST = apiHandler(async (ctx, req, params) => {
  const parsed = ticketSinglePrintQuerySchema.safeParse(requestQuery(req));
  if (!parsed.success) {
    throw new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, "Print output, scale, or crop-mark options are invalid.");
  }
  const job = await printTicket(ctx, params.id, parsed.data);
  return pdfResponse(job.pdf, job.filename);
});
