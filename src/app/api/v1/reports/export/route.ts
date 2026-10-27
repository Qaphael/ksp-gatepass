import { apiHandler, csvResponse, pdfResponse, requestQuery } from "@/lib/api";
import { reportExportQuerySchema } from "@/lib/validation/reports";
import { renderReportPdf } from "@/lib/pdf/report";
import { exportReport } from "@/server/services/reports.service";

export const GET = apiHandler(async (ctx, req) => {
  const query = reportExportQuerySchema.parse(requestQuery(req));
  const result = await exportReport(ctx, query);
  const filename = `ksp-${query.type.toLowerCase()}-${query.eventId}`;
  return query.format === "csv"
    ? csvResponse(result.csv, `${filename}.csv`)
    : pdfResponse(await renderReportPdf(result.report), `${filename}.pdf`);
});
