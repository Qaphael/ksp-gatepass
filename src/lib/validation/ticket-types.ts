import { z } from "zod";
import { isLocalDateTime } from "@/lib/time";

const localDateTimeField = z
  .string()
  .refine(isLocalDateTime, "Use the format YYYY-MM-DDTHH:mm.");

const ticketTypeFields = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullish(),
  // Integer UGX; free tickets are allowed (0), negatives are rejected.
  priceUgx: z.number().int().min(0).max(2_000_000_000),
  // null = bounded only by remaining event capacity.
  allocationLimit: z.number().int().positive().max(1_000_000).nullish(),
  salesOpensAtLocal: localDateTimeField.nullish(),
  salesClosesAtLocal: localDateTimeField.nullish(),
  permitsAdmission: z.boolean().default(true),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  printLabel: z.string().trim().max(80).nullish(),
});

function checkTicketTypeRules(
  data: Partial<z.output<typeof ticketTypeFields>>,
  ctx: z.RefinementCtx,
): void {
  if (
    (data.salesOpensAtLocal && !data.salesClosesAtLocal) ||
    (!data.salesOpensAtLocal && data.salesClosesAtLocal)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Provide both a sales start and end time (or neither).",
      path: [data.salesOpensAtLocal ? "salesClosesAtLocal" : "salesOpensAtLocal"],
    });
  }
  if (
    data.salesOpensAtLocal &&
    data.salesClosesAtLocal &&
    Date.parse(data.salesClosesAtLocal) <= Date.parse(data.salesOpensAtLocal)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Sales end must be after sales start.",
      path: ["salesClosesAtLocal"],
    });
  }
}

export const createTicketTypeSchema = ticketTypeFields.superRefine(checkTicketTypeRules);

export const updateTicketTypeSchema = ticketTypeFields
  .partial()
  .superRefine(checkTicketTypeRules);

export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>;
export type UpdateTicketTypeInput = z.infer<typeof updateTicketTypeSchema>;
