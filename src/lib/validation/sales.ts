import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || undefined);

export const saleCreateSchema = z.object({
  eventId: z.string().min(1),
  customerName: optionalText(120),
  customerPhone: optionalText(40),
  customerReference: optionalText(100),
  notes: optionalText(1000),
  discountUgx: z.number().int().min(1).max(2_000_000_000).optional(),
  discountReason: z.string().trim().min(3).max(500).optional(),
  items: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity: z.number().int().min(1).max(500),
  }).strict()).min(1).max(20),
  initialPayment: z.object({
    amountUgx: z.number().int().min(1).max(2_000_000_000),
    method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"]),
    externalRef: optionalText(120),
    notes: optionalText(500),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  const ids = value.items.map((item) => item.ticketTypeId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "Each ticket category may appear only once." });
  }
  if (value.discountUgx && !value.discountReason) {
    ctx.addIssue({ code: "custom", path: ["discountReason"], message: "A reason is required for a discount." });
  }
  if (value.discountReason && !value.discountUgx) {
    ctx.addIssue({ code: "custom", path: ["discountUgx"], message: "A discount amount is required with the reason." });
  }
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
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
export type PaymentAdjustmentInput = z.infer<typeof paymentAdjustmentSchema>;
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;
