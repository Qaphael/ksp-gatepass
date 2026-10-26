import { apiHandler, csvResponse, requestQuery } from "@/lib/api";
import { buildCsv } from "@/lib/csv";
import { ticketExportQuerySchema } from "@/lib/validation/tickets";
import { exportTickets } from "@/server/services/tickets.service";

const HEADERS = [
  "serial",
  "status",
  "event",
  "category",
  "batch",
  "created",
  "revoke reason",
] as const;

export const GET = apiHandler(async (ctx, req) => {
  const query = ticketExportQuerySchema.parse(requestQuery(req));
  const tickets = await exportTickets(ctx, query);

  // No token material of any kind in exports (AGENTS rule 6). `buildCsv`
  // neutralises spreadsheet formula injection.
  const csv = buildCsv(
    HEADERS,
    tickets.map((t) => [
      t.serial,
      t.status,
      t.eventName,
      t.ticketTypeName,
      t.batchRef ?? "",
      t.createdAt,
      t.revokeReason ?? "",
    ]),
  );

  return csvResponse(csv, `ksp-inventory-${query.eventId}.csv`);
});
