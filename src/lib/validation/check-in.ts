import { z } from "zod";

const eventId = z.string().trim().min(1).max(100);
const gate = z.string().trim().min(1).max(100);
const serial = z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/i, "Enter a ticket serial.");

export const verifyQrSchema = z.object({
  eventId,
  token: z.string().min(1).max(128),
  gate: gate.optional(),
}).strict();

export const verifySerialSchema = z.object({ eventId, serial, gate: gate.optional() }).strict();

export const confirmSchema = z.discriminatedUnion("method", [
  z.object({ eventId, method: z.literal("QR"), token: z.string().min(1).max(128), gate }).strict(),
  z.object({ eventId, method: z.literal("MANUAL"), serial, gate }).strict(),
]);

export const checkInListQuerySchema = z.object({
  eventId,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.date().optional(),
});

export const scanAttemptQuerySchema = z.object({
  eventId,
  method: z.enum(["QR", "SERIAL"]).optional(),
  resultCode: z.enum([
    "ELIGIBLE", "ADMITTED", "INVALID_QR", "UNKNOWN_SERIAL", "OTHER_EVENT", "NOT_PAID",
    "TICKET_CANCELLED", "TICKET_REVOKED", "ALREADY_USED", "NOT_YET_VALID", "EXPIRED",
    "ADMISSION_CLOSED", "TICKET_NOT_SOLD", "CATEGORY_NOT_ADMISSIBLE",
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.date().optional(),
});

export const checkInCorrectionSchema = z.object({
  confirmedTicketSerial: serial,
  reason: z.string().trim().min(3).max(500),
}).strict();

export type VerifyQrInput = z.infer<typeof verifyQrSchema>;
export type VerifySerialInput = z.infer<typeof verifySerialSchema>;
export type ConfirmInput = z.infer<typeof confirmSchema>;
export type CheckInListQuery = z.infer<typeof checkInListQuerySchema>;
export type ScanAttemptQuery = z.infer<typeof scanAttemptQuerySchema>;
export type CheckInCorrectionInput = z.infer<typeof checkInCorrectionSchema>;
