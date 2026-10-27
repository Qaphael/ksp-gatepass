import { z } from "zod";

export const REPORT_TYPES = [
  "TICKET_INVENTORY", "SALES_BY_CATEGORY", "SALES_BY_SELLER", "SALES_BY_DATE",
  "PAYMENTS_BY_METHOD", "OUTSTANDING_BALANCES", "CANCELLATIONS_REFUNDS", "PRINT_HISTORY",
  "ATTENDANCE_BY_GATE", "SCAN_ATTEMPTS", "SOLD_NOT_CHECKED_IN", "RECONCILIATION",
] as const;

const date = z.iso.date();
const reportFields = {
  eventId: z.string().trim().min(1).max(100),
  type: z.enum(REPORT_TYPES),
  from: date.optional(),
  to: date.optional(),
};

export const reportQuerySchema = z.object(reportFields).strict().superRefine((value, ctx) => {
  if (value.from && value.to && value.from > value.to) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "End date must be on or after start date." });
  }
  if (value.from && value.to && Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`) > 366 * 86_400_000) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "Choose a date range of 367 days or less." });
  }
});

export const reportExportQuerySchema = reportQuerySchema.extend({ format: z.enum(["csv", "pdf"]) });

export const auditLogQuerySchema = z.object({
  eventId: z.string().trim().min(1).max(100).optional(),
  actorId: z.string().trim().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  outcome: z.enum(["SUCCESS", "FAILURE"]).optional(),
  from: date.optional(),
  to: date.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}).strict().superRefine((value, ctx) => {
  if (value.from && value.to && value.from > value.to) ctx.addIssue({ code: "custom", path: ["to"], message: "End date must be on or after start date." });
  if (value.from && value.to && Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`) > 366 * 86_400_000) ctx.addIssue({ code: "custom", path: ["to"], message: "Choose a date range of 367 days or less." });
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
