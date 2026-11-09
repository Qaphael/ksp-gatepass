import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || undefined);

const saleFields = {
  eventId: z.string().min(1),
  customerName: optionalText(120),
  customerPhone: optionalText(40),
  customerReference: optionalText(100),
  notes: optionalText(1000),
  discountUgx: z.number().int().min(1).max(2_000_000_000).optional(),
  discountReason: z.string().trim().min(3).max(500).optional(),
  initialPayment: z.object({
    amountUgx: z.number().int().min(1).max(2_000_000_000),
    method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"]),
    externalRef: optionalText(120),
    notes: optionalText(500),
  }).strict().optional(),
};

const bulkItems = z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity: z.number().int().min(1).max(500),
  }).strict()).min(1).max(20);

const scannedTicket = z.union([
  z.object({ token: z.string().min(1).max(128) }).strict(),
  z.object({ serial: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/i), entryMethod: z.literal("MANUAL") }).strict(),
]);
const scannedTickets = z.array(scannedTicket).min(1).max(500);

function validateCommon(value: { discountUgx?: number; discountReason?: string }, ctx: z.RefinementCtx) {
  if (value.discountUgx && !value.discountReason) {
    ctx.addIssue({ code: "custom", path: ["discountReason"], message: "A reason is required for a discount." });
  }
  if (value.discountReason && !value.discountUgx) {
    ctx.addIssue({ code: "custom", path: ["discountUgx"], message: "A discount amount is required with the reason." });
  }
}

export const bulkSaleCreateSchema = z.object({
  ...saleFields,
  items: bulkItems,
}).strict().superRefine((value, ctx) => {
  validateCommon(value, ctx);
  const ids = value.items.map((item) => item.ticketTypeId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "Each ticket category may appear only once." });
  }
});

export const scannedSaleCreateSchema = z.object({
  ...saleFields,
  tickets: scannedTickets,
}).strict().superRefine(validateCommon);

export const saleCreateSchema = z.union([bulkSaleCreateSchema, scannedSaleCreateSchema]);

export const saleLookupTicketSchema = z.object({
  eventId: z.string().trim().min(1).max(100),
  token: z.string().min(1).max(128).optional(),
  serial: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/i).optional(),
}).strict().refine((value) => Boolean(value.token) !== Boolean(value.serial), {
  message: "Provide either a QR token or a ticket serial.",
  path: ["token"],
});

export const paymentCreateSchema = z.object({
  amountUgx: z.number().int().min(1).max(2_000_000_000),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"]),
  externalRef: optionalText(120),
  notes: optionalText(500),
}).strict();

export const paymentAdjustmentSchema = z.object({
  amountUgx: z.number().int().min(1).max(2_000_000_000).optional(),
  reason: z.string().trim().min(3).max(500),
}).strict();

export const saleListQuerySchema = z.object({
  eventId: z.string().min(1).optional(),
  status: z.enum(["PENDING_PAYMENT", "PARTIALLY_PAID", "PAID", "CANCELLED", "REFUNDED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type SaleCreateInput = z.infer<typeof saleCreateSchema>;
export type BulkSaleCreateInput = z.infer<typeof bulkSaleCreateSchema>;
export type ScannedSaleCreateInput = z.infer<typeof scannedSaleCreateSchema>;
export type SaleLookupTicketInput = z.infer<typeof saleLookupTicketSchema>;
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
export type PaymentAdjustmentInput = z.infer<typeof paymentAdjustmentSchema>;
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;
