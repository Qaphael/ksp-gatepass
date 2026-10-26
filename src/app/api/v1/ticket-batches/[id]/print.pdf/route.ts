import { z } from "zod";
import { apiHandler, pdfResponse, requestQuery, ServiceError, ERROR_CODES } from "@/lib/api";
import { printBatch, type PrintMode } from "@/server/services/print.service";

const modeSchema = z.enum(["full", "sample"]).default("full");

/** PRD 5.6: whole-batch print plus sample print before the production run. */
export const GET = apiHandler(async (ctx, req, params) => {
  const parsed = modeSchema.safeParse(requestQuery(req).mode ?? undefined);
  if (!parsed.success) {
    throw new ServiceError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      "mode must be 'full' or 'sample'.",
    );
  }
  const mode = parsed.data as PrintMode;
  const job = await printBatch(ctx, params.id, mode);
  return pdfResponse(job.pdf, job.filename);
});
