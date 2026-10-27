import { apiHandler, jsonOk, requestQuery } from "@/lib/api";
import { auditLogQuerySchema } from "@/lib/validation/reports";
import { listAuditLogs } from "@/server/services/audit.service";

export const GET = apiHandler(async (ctx, req) => jsonOk(await listAuditLogs(ctx, auditLogQuerySchema.parse(requestQuery(req)))));
