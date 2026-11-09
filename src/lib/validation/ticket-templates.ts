import QRCode from "qrcode";
import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const positive = z.number().finite().positive();
const coordinate = z.number().finite().nonnegative();
const fontRef = z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N} _.-]+$/u, "Use a font identifier, not a file path.");

const fieldSchema = z.object({
  key: z.enum(["serial", "category", "price", "eventName", "eventDate", "eventTime", "venue", "footerText", "organiserContact", "authNotice"]),
  xMm: coordinate,
  yMm: coordinate,
  maxWidthMm: positive,
  font: z.enum(["primary", "mono"]),
  sizePt: positive,
  weight: z.enum(["regular", "bold"]),
  color: z.string().regex(HEX_COLOR),
  align: z.enum(["left", "center", "right"]),
  uppercase: z.boolean(),
  letterSpacingPt: z.number().finite().min(-20).max(100),
  enabled: z.boolean(),
}).strict();

const boxSchema = z.object({
  xMm: coordinate,
  yMm: coordinate,
  widthMm: positive,
  heightMm: positive,
  fields: z.array(fieldSchema),
}).strict();

const qrSchema = z.object({
  xMm: coordinate,
  yMm: coordinate,
  sizeMm: positive,
  errorCorrection: z.literal("M"),
  panel: z.object({
    enabled: z.boolean(),
    color: z.string().regex(HEX_COLOR),
    paddingMm: coordinate,
    radiusMm: coordinate,
  }).strict(),
}).strict();

const templateConfigBaseSchema = z.object({
  schemaVersion: z.literal(1),
  trim: z.object({ widthMm: z.literal(210), heightMm: z.literal(59) }).strict(),
  bleedMm: z.number().finite().min(0).max(50),
  perforationXMm: coordinate.nullable(),
  qr: qrSchema,
  bottomStrip: boxSchema,
  stub: boxSchema.extend({ rotation: z.union([z.literal(0), z.literal(90), z.literal(270)]) }).strict(),
  fonts: z.object({ primary: fontRef, mono: fontRef }).strict(),
}).strict();

// Tokens are always 43 base64url characters. Lowercase bytes force the
// maximum QR version among supported token contents at error correction M.
const QR_MODULE_COUNT = QRCode.create("x".repeat(43), { errorCorrectionLevel: "M" }).modules.size;
export const TEMPLATE_A4_SCALE = 0.94;
export const QR_MIN_PRINTED_SIZE_MM = 20;
export const QR_MIN_MODULE_SIZE_MM = 0.5;

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string) {
  ctx.addIssue({ code: "custom", path, message });
}

export const ticketTemplateConfigSchema = templateConfigBaseSchema.superRefine((config, ctx) => {
  const { widthMm, heightMm } = config.trim;
  const zones = [
    { name: "qr", x: config.qr.xMm, y: config.qr.yMm, width: config.qr.sizeMm, height: config.qr.sizeMm, fields: [] as z.infer<typeof fieldSchema>[] },
    { name: "bottomStrip", x: config.bottomStrip.xMm, y: config.bottomStrip.yMm, width: config.bottomStrip.widthMm, height: config.bottomStrip.heightMm, fields: config.bottomStrip.fields },
    { name: "stub", x: config.stub.xMm, y: config.stub.yMm, width: config.stub.widthMm, height: config.stub.heightMm, fields: config.stub.fields },
  ];

  for (const zone of zones) {
    if (zone.x + zone.width > widthMm + 1e-8 || zone.y + zone.height > heightMm + 1e-8) {
      addIssue(ctx, [zone.name], "Zone must fit inside the 210 × 59 mm trim box.");
    }
    zone.fields.forEach((field, index) => {
      const textHeightMm = (field.sizePt * 25.4) / 72;
      if (field.xMm + field.maxWidthMm > zone.width + 1e-8 || field.yMm + textHeightMm > zone.height + 1e-8) {
        addIssue(ctx, [zone.name, "fields", index], "Field must fit inside its configured zone.");
      }
    });
  }

  if (config.perforationXMm !== null && config.perforationXMm > widthMm) {
    addIssue(ctx, ["perforationXMm"], "Perforation must be within the trim width.");
  }

  if (config.qr.panel.paddingMm * 2 >= config.qr.sizeMm) {
    addIssue(ctx, ["qr", "panel", "paddingMm"], "QR panel padding must be smaller than half the QR zone.");
  }

  const printedQrSizeMm = config.qr.sizeMm * TEMPLATE_A4_SCALE;
  if (printedQrSizeMm < QR_MIN_PRINTED_SIZE_MM) {
    addIssue(ctx, ["qr", "sizeMm"], `QR must print at least ${QR_MIN_PRINTED_SIZE_MM} mm wide at the default 94% A4 scale.`);
  }
  const moduleSizeMm = printedQrSizeMm / (QR_MODULE_COUNT + 8);
  if (moduleSizeMm < QR_MIN_MODULE_SIZE_MM) {
    addIssue(ctx, ["qr", "sizeMm"], `QR modules must print at least ${QR_MIN_MODULE_SIZE_MM} mm at the default 94% A4 scale.`);
  }
});

export type TicketTemplateConfig = z.infer<typeof ticketTemplateConfigSchema>;

export const createTicketTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ticketTypeId: z.string().trim().min(1).nullable().optional(),
  config: ticketTemplateConfigSchema,
}).strict();

export const patchTicketTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  ticketTypeId: z.string().trim().min(1).nullable().optional(),
  config: ticketTemplateConfigSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, "Provide at least one template change.");

export const activateTicketTemplateSchema = z.object({
  ownerConfirmed: z.literal(true),
  production: z.boolean().default(true),
}).strict();

export const confirmTicketTemplateCalibrationSchema = z.object({
  printBatchId: z.string().trim().min(1).max(128),
  confirmedPrinted: z.literal(true),
}).strict();

/** Structurally valid, intentionally non-activatable development coordinates. */
export function placeholderTicketTemplateConfig(): TicketTemplateConfig {
  return {
    schemaVersion: 1,
    trim: { widthMm: 210, heightMm: 59 },
    bleedMm: 3,
    perforationXMm: null,
    qr: {
      xMm: 155, yMm: 5, sizeMm: 30, errorCorrection: "M",
      panel: { enabled: true, color: "#FFFFFF", paddingMm: 2, radiusMm: 1.5 },
    },
    bottomStrip: { xMm: 4, yMm: 44, widthMm: 150, heightMm: 12, fields: [] },
    stub: { xMm: 185, yMm: 4, widthMm: 21, heightMm: 51, rotation: 0, fields: [] },
    fonts: { primary: "primary", mono: "mono" },
  };
}
