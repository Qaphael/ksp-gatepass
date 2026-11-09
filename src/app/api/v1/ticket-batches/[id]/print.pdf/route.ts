import { apiHandler, pdfResponse, requestQuery, ServiceError, ERROR_CODES } from "@/lib/api";
import { printBatch, type PrintMode } from "@/server/services/print.service";
import { ticketBatchPrintQuerySchema } from "@/lib/validation/ticket-print";

/** PRD 5.6: whole-batch print plus sample print before the production run. */
export const GET = apiHandler(async (ctx, req, params) => {
  const parsed = ticketBatchPrintQuerySchema.safeParse(requestQuery(req));
  if (!parsed.success) {
    throw new ServiceError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      "Print output, mode, scale, tickets per page, or crop-mark options are invalid.",
    );
  }
  const { mode, ...options } = parsed.data;
  const job = await printBatch(ctx, params.id, mode as PrintMode, options);
  return pdfResponse(job.pdf, job.filename);
});
