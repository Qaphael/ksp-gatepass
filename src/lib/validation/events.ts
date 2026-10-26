import { z } from "zod";
import { assertTimeZone, isLocalDateTime } from "@/lib/time";

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const timeField = z
  .string()
  .regex(TIME_RE, "Use 24-hour HH:mm format.");

const localDateTimeField = z
  .string()
  .refine(isLocalDateTime, "Use the format YYYY-MM-DDTHH:mm.");

const calendarDateField = z
  .string()
  .regex(DATE_RE, "Use the format YYYY-MM-DD.")
  .refine(
    (value) => new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
    "Not a real calendar date.",
  );

/** Absolute windows are entered as wall-clock time in the event timezone. */
export const eventBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  venue: z.string().trim().min(1).max(200),
  address: z.string().trim().max(300).nullish(),
  timezone: z.string().trim().min(1).max(60).default("Africa/Kampala"),
  eventDate: calendarDateField,
  startTime: timeField,
  endTime: timeField,
  capacity: z.number().int().positive().max(1_000_000),
  salesOpensAtLocal: localDateTimeField.nullish(),
  salesClosesAtLocal: localDateTimeField.nullish(),
  admissionOpensAtLocal: localDateTimeField.nullish(),
  admissionClosesAtLocal: localDateTimeField.nullish(),
  accentColor: z.string().regex(HEX_COLOR_RE, "Use a #rrggbb colour.").nullish(),
  ticketFooterText: z.string().trim().max(300).nullish(),
  organiserContact: z.string().trim().max(200).nullish(),
  // COMPLETED/ARCHIVED only change through their dedicated endpoints.
  status: z.enum(["DRAFT", "SCHEDULED"]).default("DRAFT"),
  admissionPolicy: z.enum(["FULL_PAYMENT"]).default("FULL_PAYMENT"),
});

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

type EventRuleData = Partial<z.output<typeof eventBaseSchema>>;

/** PRD 5.3 validation rules 1 and 3 (also applied on partial update input). */
function checkEventRules(data: EventRuleData, ctx: z.RefinementCtx): void {
  if (data.timezone !== undefined) {
    try {
      assertTimeZone(data.timezone);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Unknown IANA timezone.",
        path: ["timezone"],
      });
    }
  }
  if (data.startTime !== undefined && data.endTime !== undefined) {
    if (toMinutes(data.endTime) <= toMinutes(data.startTime)) {
      ctx.addIssue({
        code: "custom",
        message: "End time must be after start time.",
        path: ["endTime"],
      });
    }
  }
  const windows: Array<[string, string | null | undefined, string]> = [
    ["salesOpensAtLocal", data.salesOpensAtLocal, "salesClosesAtLocal"],
    ["admissionOpensAtLocal", data.admissionOpensAtLocal, "admissionClosesAtLocal"],
  ];
  for (const [openField, openValue, closeField] of windows) {
    const closeValue = (data as Record<string, unknown>)[closeField] as
      | string
      | null
      | undefined;
    if (openValue && closeValue && Date.parse(closeValue) <= Date.parse(openValue)) {
      ctx.addIssue({
        code: "custom",
        message: "Closing time must be after opening time.",
        path: [closeField],
      });
    }
    if ((openValue && !closeValue) || (!openValue && closeValue)) {
      ctx.addIssue({
        code: "custom",
        message: `Provide both an opening and a closing time (or neither).`,
        path: [openValue ? closeField : openField],
      });
    }
  }
}

export const createEventSchema = eventBaseSchema.superRefine(checkEventRules);

export const updateEventSchema = eventBaseSchema
  .partial()
  .superRefine(checkEventRules);

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
