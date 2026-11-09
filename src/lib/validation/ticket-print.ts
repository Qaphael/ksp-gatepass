import { z } from "zod";
import { TEMPLATE_A4_SCALE } from "./ticket-templates";

const outputKindSchema = z.enum(["SHEET", "SINGLE", "DATA_LAYER"]);

const optionsSchema = z.object({
  outputKind: outputKindSchema,
  ticketsPerPage: z.coerce.number().int().min(1).max(10),
  scale: z.coerce.number().finite().min(0.1).max(1),
  cropMarks: z.enum(["true", "false"]).transform((value) => value === "true"),
}).strict();

export const ticketBatchPrintQuerySchema = optionsSchema.extend({
  mode: z.enum(["full", "sample"]).default("full"),
  outputKind: outputKindSchema.default("SHEET"),
  ticketsPerPage: z.coerce.number().int().min(1).max(10).default(5),
  scale: z.coerce.number().finite().min(0.1).max(1).default(TEMPLATE_A4_SCALE),
  cropMarks: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
}).strict();

export const ticketSinglePrintQuerySchema = optionsSchema.extend({
  outputKind: outputKindSchema.default("SINGLE"),
  ticketsPerPage: z.coerce.number().int().min(1).max(10).default(1),
  scale: z.coerce.number().finite().min(0.1).max(1).default(1),
  cropMarks: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
}).strict();

export const ticketPrintLayoutSchema = z.object({
  outputKind: z.enum(["SHEET", "SINGLE", "DATA_LAYER", "CALIBRATION"]),
  pageSize: z.enum(["A4", "TICKET_WITH_BLEED"]),
  ticketsPerPage: z.number().int().min(1).max(10),
  scale: z.number().finite().min(0.1).max(1),
  cropMarks: z.boolean(),
  includeBleed: z.boolean(),
}).strict();

export type TicketBatchPrintQuery = z.infer<typeof ticketBatchPrintQuerySchema>;
export type TicketSinglePrintQuery = z.infer<typeof ticketSinglePrintQuerySchema>;
