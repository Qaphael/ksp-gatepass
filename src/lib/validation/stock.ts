import { z } from "zod";

const serial = z.string().trim().toUpperCase().min(1).max(64).regex(/^[A-Z0-9][A-Z0-9-]*$/);
const uniqueSerials = z.array(serial).min(1).max(500).superRefine((values, ctx) => {
  if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: "Ticket serials must be unique." });
});
const selection = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TOKENS"), tokens: z.array(z.string().regex(/^[A-Za-z0-9_-]{43}$/)).min(1).max(500).superRefine((values,ctx)=>{if(new Set(values).size!==values.length)ctx.addIssue({code:"custom",message:"Scanned tickets must be unique."})}) }).strict(),
  z.object({ kind: z.literal("RANGE"), serialFrom: serial, serialTo: serial }).strict().refine((value) => value.serialFrom <= value.serialTo, { message: "The start serial must be before the end serial.", path: ["serialTo"] }),
  z.object({ kind: z.literal("SERIALS"), serials: uniqueSerials }).strict(),
  z.object({ kind: z.literal("CATEGORY_QUANTITY"), ticketTypeId: z.string().trim().min(1).max(100), quantity: z.number().int().min(1).max(500) }).strict(),
]);

export const stockIssueSchema = z.object({
  eventId: z.string().trim().min(1).max(100),
  sellerId: z.string().trim().min(1).max(100),
  selection,
}).strict();

export const stockReturnSchema = z.object({
  eventId: z.string().trim().min(1).max(100),
  sellerId: z.string().trim().min(1).max(100),
  serials: uniqueSerials,
  note: z.string().trim().max(500).optional(),
}).strict();

export const stockLossSchema = z.object({
  eventId: z.string().trim().min(1).max(100),
  sellerId: z.string().trim().min(1).max(100),
  serials: uniqueSerials,
  reason: z.string().trim().min(3).max(500),
}).strict();

export const stockStatementQuerySchema = z.object({ eventId: z.string().trim().min(1).max(100) }).strict();

export const stockCloseoutSchema = z.object({ eventId: z.string().trim().min(1).max(100) }).strict();

export const remittanceCreateSchema = z.object({
  eventId: z.string().trim().min(1).max(100),
  sellerId: z.string().trim().min(1).max(100),
  amountUgx: z.number().int().min(1).max(2_000_000_000),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"]),
  receivedById: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional(),
}).strict();

export const remittanceReverseSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export type StockIssueInput = z.infer<typeof stockIssueSchema>;
export type StockReturnInput = z.infer<typeof stockReturnSchema>;
export type StockLossInput = z.infer<typeof stockLossSchema>;
export type StockStatementQuery = z.infer<typeof stockStatementQuerySchema>;
export type StockCloseoutInput = z.infer<typeof stockCloseoutSchema>;
export type RemittanceCreateInput = z.infer<typeof remittanceCreateSchema>;
export type RemittanceReverseInput = z.infer<typeof remittanceReverseSchema>;
