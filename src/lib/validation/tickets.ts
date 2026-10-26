import { z } from "zod";
import { SERIAL_NUMBER_MAX, SERIAL_PREFIX_DEFAULT, SERIAL_PREFIX_RE } from "@/lib/serial";

/** Ticket inventory states (PRD 7.1) — kept separate from sale/admission. */
export const TICKET_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "CANCELLED",
  "REVOKED",
] as const;

const prefixField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(SERIAL_PREFIX_RE, "Use 1-12 characters: letters, numbers, dashes.");

/** PRD 5.5 ticket-generation dialog. `serialStart` omitted = next free number. */
export const generateBatchSchema = z.object({
  eventId: z.string().trim().min(1),
  ticketTypeId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(10_000),
  serialPrefix: prefixField.default(SERIAL_PREFIX_DEFAULT),
  serialStart: z
    .number()
    .int()
    .min(0)
    .max(SERIAL_NUMBER_MAX)
    .optional(),
  label: z.string().trim().max(100).nullish(),
});

export type GenerateBatchInput = z.infer<typeof generateBatchSchema>;

/** Revocation always requires a documented reason (business rule 11). */
export const revokeTicketSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Give a reason of at least 3 characters.")
    .max(500),
});

export type RevokeTicketInput = z.infer<typeof revokeTicketSchema>;

const intQuery = z.coerce.number().int().min(1);

/** Inventory list filters (PRD 5.5: search by serial, filter by everything). */
export const ticketListQuerySchema = z.object({
  eventId: z.string().trim().min(1).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  ticketTypeId: z.string().trim().min(1).optional(),
  batchId: z.string().trim().min(1).optional(),
  /** Serial search: exact or prefix, e.g. `KSP-000`. */
  search: z.string().trim().max(50).optional(),
  page: intQuery.default(1),
  pageSize: intQuery.max(100).default(25),
});

export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

/** CSV export uses the same filters but no pagination. */
export const ticketExportQuerySchema = ticketListQuerySchema
  .omit({ page: true, pageSize: true })
  .refine((q) => q.eventId !== undefined, {
    message: "Choose an event to export.",
    path: ["eventId"],
  });

export type TicketExportQuery = z.infer<typeof ticketExportQuerySchema>;
