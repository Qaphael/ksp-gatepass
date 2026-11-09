import type { Prisma, TicketStatus, TicketTemplateOutputKind } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { readTicketTemplateArtwork } from "@/lib/ticket-template-storage";
import {
  createTemplateSheetLayout,
  renderTemplateCalibrationPdf,
  renderTemplateTicketsPdf,
  type TemplateOutputKind,
  type TemplateSheetLayout,
  type TicketRowSlot,
} from "@/lib/pdf/ticket-template";
import { renderTicketsPdf, type TicketPrintRow } from "@/lib/pdf/ticket";
import { ticketPrintLayoutSchema } from "@/lib/validation/ticket-print";
import { ticketTemplateConfigSchema } from "@/lib/validation/ticket-templates";
import { decryptToken } from "@/lib/qr/token-vault";
import { conflict, forbidden, notFound, requirePermission, validationError } from "./errors";

/** Cancelled/revoked inventory can never be printed or reprinted (rule 8). */
const PRINTABLE_STATUS: { notIn: TicketStatus[] } = { notIn: ["CANCELLED", "REVOKED"] };

const EVENT_SELECT = {
  name: true,
  venue: true,
  address: true,
  eventDate: true,
  startTime: true,
  endTime: true,
  accentColor: true,
  ticketFooterText: true,
  organiserContact: true,
} as const;

const TICKET_TYPE_SELECT = { name: true, printLabel: true, priceUgx: true } as const;

const PRINT_TEMPLATE_SELECT = {
  id: true,
  eventId: true,
  ticketTypeId: true,
  version: true,
  assetStorageKey: true,
  config: true,
  status: true,
  zonesArePlaceholder: true,
} as const;

type PrintableTicket = {
  id?: string;
  serial: string;
  tokenEnc: string;
  batchId?: string | null;
  eventId?: string;
  event: {
    name: string;
    venue: string;
    address: string | null;
    eventDate: Date;
    startTime: string;
    endTime: string;
    accentColor: string | null;
    ticketFooterText: string | null;
    organiserContact: string | null;
  };
  ticketType: { name: string; printLabel: string | null; priceUgx: number };
};

type PrintTemplate = Prisma.TicketTemplateGetPayload<{ select: typeof PRINT_TEMPLATE_SELECT }>;

export interface PrintJob {
  pdf: Buffer;
  filename: string;
  ticketCount: number;
  /** Tickets skipped because they are cancelled or revoked. */
  skipped: number;
  printBatchId: string;
}

export type PrintMode = "full" | "sample";
export interface PrintOptions {
  outputKind: Exclude<TemplateOutputKind, "CALIBRATION">;
  ticketsPerPage: number;
  scale: number;
  cropMarks: boolean;
}

const LEGACY_LAYOUT = createTemplateSheetLayout("SHEET", { ticketsPerPage: 5, scale: 0.94 });

function toRow(ticket: PrintableTicket): TicketPrintRow {
  return {
    serial: ticket.serial,
    // This is the only print module that decrypts tokens. Tokens exist only in
    // renderer memory and are never copied into PrintBatch or audit metadata.
    token: decryptToken(ticket.tokenEnc),
    ticketTypeName: ticket.ticketType.name,
    printLabel: ticket.ticketType.printLabel,
    ticketPriceUgx: ticket.ticketType.priceUgx,
    event: {
      name: ticket.event.name,
      venue: ticket.event.venue,
      address: ticket.event.address,
      eventDate: ticket.event.eventDate.toISOString().slice(0, 10),
      startTime: ticket.event.startTime,
      endTime: ticket.event.endTime,
      accentColor: ticket.event.accentColor,
      ticketFooterText: ticket.event.ticketFooterText,
      organiserContact: ticket.event.organiserContact,
    },
  };
}

function safeLayout(outputKind: Exclude<TemplateOutputKind, "CALIBRATION">, options: PrintOptions): TemplateSheetLayout {
  try {
    return createTemplateSheetLayout(outputKind, options);
  } catch (error) {
    throw validationError(error instanceof Error ? error.message : "The selected print layout is invalid.");
  }
}

function parseStoredLayout(value: Prisma.JsonValue | null): TemplateSheetLayout | null {
  if (!value) return null;
  const result = ticketPrintLayoutSchema.safeParse(value);
  if (!result.success) throw conflict("The recorded print layout is invalid and cannot be safely reprinted.");
  return result.data;
}

function metadataSerials(value: Prisma.JsonValue | null): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const serials = (value as Record<string, Prisma.JsonValue>).serials;
  return Array.isArray(serials) && serials.every((serial) => typeof serial === "string")
    ? serials as string[]
    : null;
}

async function findActiveTemplate(eventId: string, ticketTypeId: string): Promise<PrintTemplate | null> {
  const specific = await prisma.ticketTemplate.findFirst({
    where: { eventId, ticketTypeId, status: "ACTIVE" },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: PRINT_TEMPLATE_SELECT,
  });
  if (specific) return specific;
  return prisma.ticketTemplate.findFirst({
    where: { eventId, ticketTypeId: null, status: "ACTIVE" },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: PRINT_TEMPLATE_SELECT,
  });
}

async function findRecordedTemplate(templateId: string, version: number | null): Promise<PrintTemplate> {
  const template = await prisma.ticketTemplate.findUnique({ where: { id: templateId }, select: PRINT_TEMPLATE_SELECT });
  if (!template || version === null || template.version !== version) {
    throw conflict("The template version recorded for this print is no longer available.");
  }
  return template;
}

function parseTemplateConfig(template: PrintTemplate) {
  const parsed = ticketTemplateConfigSchema.safeParse(template.config);
  if (!parsed.success) throw conflict("The ticket template configuration is invalid.");
  return parsed.data;
}

async function renderTemplateOutput(
  template: PrintTemplate,
  rows: TicketRowSlot[],
  outputKind: Exclude<TemplateOutputKind, "CALIBRATION">,
  layout: TemplateSheetLayout,
  extra: { slotIndexes?: number[]; pageCount?: number } = {},
): Promise<Buffer> {
  const config = parseTemplateConfig(template);
  if (template.status === "ACTIVE" && template.zonesArePlaceholder) {
    throw conflict("Measured template zones are required before production printing.");
  }
  let artwork: { data: Buffer; format: "png" | "jpeg" } | undefined;
  if (outputKind !== "DATA_LAYER") {
    try {
      artwork = {
        data: await readTicketTemplateArtwork(template.assetStorageKey),
        format: template.assetStorageKey.endsWith(".png") ? "png" : "jpeg",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw conflict("Ticket template artwork is missing from storage.");
      throw error;
    }
  }
  try {
    return await renderTemplateTicketsPdf({ config, artwork, rows, outputKind, layout, ...extra });
  } catch (error) {
    if (error instanceof Error && /Printed QR|QR module size|QR and its light panel|do not fit on A4/.test(error.message)) {
      throw conflict(error.message);
    }
    throw error;
  }
}

function printFilename(batchRef: string, outputKind: TemplateOutputKind, mode: PrintMode): string {
  if (outputKind === "SHEET") return mode === "sample" ? `ksp-sample-${batchRef}.pdf` : `ksp-${batchRef}.pdf`;
  return `ksp-${batchRef}-${outputKind.toLocaleLowerCase().replace("_", "-")}.pdf`;
}

/**
 * Prints a full generation batch or a one-ticket sample. With no active
 * template, the established A4 generator remains the legacy fallback.
 */
export async function printBatch(
  ctx: AuthContext,
  batchId: string,
  mode: PrintMode,
  options: PrintOptions = { outputKind: "SHEET", ticketsPerPage: 5, scale: 0.94, cropMarks: false },
): Promise<PrintJob> {
  requirePermission(ctx.role, "ticket:print");

  const batch = await prisma.ticketBatch.findUnique({
    where: { id: batchId },
    select: { id: true, batchRef: true, eventId: true, ticketTypeId: true },
  });
  if (!batch) throw notFound("Batch not found.");

  const [totalInBatch, printableCount] = await Promise.all([
    prisma.ticket.count({ where: { batchId } }),
    prisma.ticket.count({ where: { batchId, status: PRINTABLE_STATUS } }),
  ]);
  const tickets = await prisma.ticket.findMany({
    where: { batchId, status: PRINTABLE_STATUS },
    orderBy: { serial: "asc" },
    ...(mode === "sample" ? { take: 1 } : {}),
    select: {
      id: true,
      serial: true,
      tokenEnc: true,
      event: { select: EVENT_SELECT },
      ticketType: { select: TICKET_TYPE_SELECT },
    },
  });
  if (tickets.length === 0) throw conflict("There are no printable tickets in this batch.");

  const skipped = mode === "full" ? totalInBatch - printableCount : 0;
  const rows = tickets.map(toRow);
  const activeTemplate = await findActiveTemplate(batch.eventId, batch.ticketTypeId);
  if (!activeTemplate && options.outputKind !== "SHEET") {
    throw conflict("Activate a ticket template before requesting single-ticket or data-layer output.");
  }
  const outputKind = activeTemplate ? options.outputKind : "SHEET";
  const layout = activeTemplate ? safeLayout(outputKind, options) : LEGACY_LAYOUT;
  const pdf = activeTemplate
    ? await renderTemplateOutput(activeTemplate, rows, outputKind, layout)
    : await renderTicketsPdf(rows);

  const printBatchRecord = await prisma.printBatch.create({
    data: {
      kind: mode === "sample" ? "SAMPLE" : "PRODUCTION",
      eventId: batch.eventId,
      ticketBatchId: batch.id,
      ticketCount: rows.length,
      actorId: ctx.userId,
      templateId: activeTemplate?.id ?? null,
      templateVersion: activeTemplate?.version ?? null,
      sheetLayoutSnapshot: layout as unknown as Prisma.InputJsonObject,
      outputKind,
      metadata: {
        batchRef: batch.batchRef,
        mode,
        serialFirst: rows[0].serial,
        serialLast: rows[rows.length - 1].serial,
        serials: rows.map((row) => row.serial),
        skipped,
      },
    },
  });
  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: mode === "sample" ? "ticket-batch.print-sample" : "ticket-batch.print",
    targetType: "ticket-batch",
    targetId: batch.id,
    eventId: batch.eventId,
    summary: {
      batchRef: batch.batchRef,
      ticketCount: rows.length,
      skipped,
      printBatchId: printBatchRecord.id,
      templateId: activeTemplate?.id ?? null,
      templateVersion: activeTemplate?.version ?? null,
      outputKind,
    },
  });
  return {
    pdf,
    filename: printFilename(batch.batchRef, outputKind, mode),
    ticketCount: rows.length,
    skipped,
    printBatchId: printBatchRecord.id,
  };
}

/** Generates the calibration PDF. Physical print confirmation is a separate audited POST. */
export async function renderTicketTemplateCalibration(ctx: AuthContext, templateId: string): Promise<PrintJob> {
  if (ctx.role !== "ADMIN") throw forbidden("Only administrators can print ticket template calibration sheets.");
  requirePermission(ctx.role, "template:manage");
  const template = await prisma.ticketTemplate.findUnique({ where: { id: templateId }, select: PRINT_TEMPLATE_SELECT });
  if (!template) throw notFound("Ticket template not found.");
  const config = parseTemplateConfig(template);
  let artwork: Buffer;
  try {
    artwork = await readTicketTemplateArtwork(template.assetStorageKey);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw conflict("Ticket template artwork is missing from storage.");
    throw error;
  }
  const rendered = await renderTemplateCalibrationPdf({
    config,
    artwork: { data: artwork, format: template.assetStorageKey.endsWith(".png") ? "png" : "jpeg" },
  });
  const record = await prisma.printBatch.create({
    data: {
      kind: "SAMPLE",
      eventId: template.eventId,
      // Calibration creates one physical sheet even though it contains no
      // ticket records (the schema requires every PrintBatch count > 0).
      ticketCount: 1,
      actorId: ctx.userId,
      templateId: template.id,
      templateVersion: template.version,
      sheetLayoutSnapshot: rendered.layout as unknown as Prisma.InputJsonObject,
      outputKind: "CALIBRATION",
      metadata: { calibrationPdfGenerated: true },
    },
  });
  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "ticket-template.calibration.generate",
    targetType: "ticket-template",
    targetId: template.id,
    eventId: template.eventId,
    summary: { printBatchId: record.id, templateVersion: template.version, outputKind: "CALIBRATION" },
  });
  return {
    pdf: rendered.pdf,
    filename: `ksp-calibration-${template.id}-v${template.version}.pdf`,
    ticketCount: 0,
    skipped: 0,
    printBatchId: record.id,
  };
}

interface ReprintSource {
  id: string;
  kind: string;
  eventId: string;
  ticketBatchId: string | null;
  ticketId: string | null;
  templateId: string | null;
  templateVersion: number | null;
  sheetLayoutSnapshot: Prisma.JsonValue | null;
  outputKind: TicketTemplateOutputKind | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}

/** Repeats an earlier batch output using the recorded version and exact layout snapshot. */
export async function reprintBatchOutput(ctx: AuthContext, sourcePrintBatchId: string): Promise<PrintJob> {
  requirePermission(ctx.role, "ticket:reprint");
  const source = await prisma.printBatch.findUnique({ where: { id: sourcePrintBatchId } }) as ReprintSource | null;
  if (!source) throw notFound("Print batch not found.");
  if (source.kind === "EXPORT") throw conflict("This print batch has no printable output.");
  const layout = parseStoredLayout(source.sheetLayoutSnapshot);
  if (source.templateId && !layout) throw conflict("The recorded template print has no layout snapshot.");

  let rows: TicketRowSlot[] = [];
  const recordedSerials = metadataSerials(source.metadata);
  if (source.outputKind !== "CALIBRATION") {
    if (source.ticketId) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: source.ticketId },
        select: { id: true, serial: true, tokenEnc: true, status: true, event: { select: EVENT_SELECT }, ticketType: { select: TICKET_TYPE_SELECT } },
      });
      if (!ticket || ticket.status === "CANCELLED" || ticket.status === "REVOKED") {
        throw conflict("A cancelled or revoked ticket can never be reprinted.");
      }
      rows = [toRow(ticket)];
    } else if (source.ticketBatchId) {
      const serials = recordedSerials;
      const tickets = await prisma.ticket.findMany({
        where: { batchId: source.ticketBatchId, ...(serials ? { serial: { in: serials } } : {}), status: PRINTABLE_STATUS },
        orderBy: { serial: "asc" },
        select: { id: true, serial: true, tokenEnc: true, event: { select: EVENT_SELECT }, ticketType: { select: TICKET_TYPE_SELECT } },
      });
      if (serials) {
        const bySerial = new Map(tickets.map((ticket) => [ticket.serial, toRow(ticket)]));
        rows = serials.map((serial) => bySerial.get(serial) ?? null);
      } else {
        rows = tickets.map(toRow);
      }
    } else {
      throw conflict("This print batch cannot be recreated because it has no ticket source.");
    }
  }
  const ticketCount = rows.filter((row) => row !== null).length;
  if (source.outputKind !== "CALIBRATION" && ticketCount === 0) {
    throw conflict("There are no printable tickets left in this output.");
  }

  let template: PrintTemplate | null = null;
  if (source.templateId) template = await findRecordedTemplate(source.templateId, source.templateVersion);
  let pdf: Buffer;
  if (source.outputKind === "CALIBRATION") {
    if (!template || !layout) throw conflict("The recorded calibration template version is unavailable.");
    const config = parseTemplateConfig(template);
    const artwork = await readTicketTemplateArtwork(template.assetStorageKey);
    pdf = (await renderTemplateCalibrationPdf({
      config,
      artwork: { data: artwork, format: template.assetStorageKey.endsWith(".png") ? "png" : "jpeg" },
    })).pdf;
  } else if (template && source.outputKind && layout) {
    const serials = recordedSerials ?? [];
    const pageCount = source.outputKind === "SHEET" && serials.length
      ? Math.ceil(serials.length / layout.ticketsPerPage)
      : undefined;
    const slots = source.outputKind === "SHEET" && source.ticketId
      ? [Math.max(0, serials.indexOf(rows.find((row) => row)?.serial ?? ""))]
      : undefined;
    pdf = await renderTemplateOutput(template, rows, source.outputKind, layout, {
      pageCount,
      ...(slots ? { slotIndexes: slots } : {}),
    });
  } else {
    // Print batches created before templates, or batches printed while an event
    // had no active template, keep the original legacy generator as fallback.
    pdf = await renderTicketsPdf(rows.filter((row): row is TicketPrintRow => row !== null));
  }

  const serials = recordedSerials ?? rows.flatMap((row) => row ? [row.serial] : []);
  const record = await prisma.printBatch.create({
    data: {
      kind: "REPRINT",
      eventId: source.eventId,
      ticketBatchId: source.ticketBatchId,
      ticketId: source.ticketId,
      ticketCount,
      actorId: ctx.userId,
      templateId: source.templateId,
      templateVersion: source.templateVersion,
      sheetLayoutSnapshot: source.sheetLayoutSnapshot ?? undefined,
      outputKind: source.outputKind,
      metadata: { sourcePrintBatchId: source.id, serials, skipped: rows.length - ticketCount },
    },
  });
  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "print-batch.reprint",
    targetType: "print-batch",
    targetId: source.id,
    eventId: source.eventId,
    summary: {
      printBatchId: record.id,
      sourcePrintBatchId: source.id,
      ticketCount,
      templateId: source.templateId,
      templateVersion: source.templateVersion,
      outputKind: source.outputKind,
    },
  });
  return { pdf, filename: `ksp-reprint-${source.id}.pdf`, ticketCount, skipped: rows.length - ticketCount, printBatchId: record.id };
}

/**
 * First prints use the active template. Direct reprints keep the prior
 * PrintBatch's immutable version/layout; without a template, the legacy path
 * remains unchanged.
 */
export async function printTicket(
  ctx: AuthContext,
  ticketId: string,
  options: PrintOptions = { outputKind: "SINGLE", ticketsPerPage: 1, scale: 1, cropMarks: false },
): Promise<PrintJob> {
  requirePermission(ctx.role, "ticket:print");
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, serial: true, status: true, eventId: true, batchId: true, tokenEnc: true,
      ticketTypeId: true,
      event: { select: EVENT_SELECT },
      ticketType: { select: TICKET_TYPE_SELECT },
    },
  });
  if (!ticket) throw notFound("Ticket not found.");
  if (ticket.status === "REVOKED") throw conflict("A revoked ticket can never be printed or reprinted.");
  if (ticket.status === "CANCELLED") throw conflict("A cancelled ticket can never be printed.");

  const directSource = await prisma.printBatch.findFirst({
    where: { ticketId: ticket.id, kind: { in: ["PRODUCTION", "REPRINT"] } },
    orderBy: { createdAt: "desc" },
  }) as ReprintSource | null;
  const batchSource = ticket.batchId ? await prisma.printBatch.findFirst({
    where: { ticketBatchId: ticket.batchId, kind: { in: ["PRODUCTION", "REPRINT"] } },
    orderBy: { createdAt: "desc" },
  }) as ReprintSource | null : null;
  const source = directSource && batchSource
    ? (directSource.id === batchSource.id ? directSource : directSource.createdAt >= batchSource.createdAt ? directSource : batchSource)
    : directSource ?? batchSource;
  const isReprint = Boolean(source);
  if (isReprint) requirePermission(ctx.role, "ticket:reprint");

  const row = toRow(ticket);
  let template: PrintTemplate | null = null;
  let outputKind: TemplateOutputKind = "SHEET";
  let layout: TemplateSheetLayout = LEGACY_LAYOUT;
  let slotIndex: number | undefined;
  if (source) {
    outputKind = source.outputKind ?? "SHEET";
    layout = parseStoredLayout(source.sheetLayoutSnapshot) ?? LEGACY_LAYOUT;
    if (source.templateId) template = await findRecordedTemplate(source.templateId, source.templateVersion);
    const serials = metadataSerials(source.metadata);
    if (source.outputKind === "SHEET" && serials) slotIndex = Math.max(0, serials.indexOf(ticket.serial));
  } else {
    template = await findActiveTemplate(ticket.eventId, ticket.ticketTypeId);
    if (template) {
      outputKind = options.outputKind;
      layout = safeLayout(outputKind, options);
    }
  }

  if (!source && !template && options.outputKind === "DATA_LAYER") {
    throw conflict("Activate a ticket template before requesting a data-only PDF.");
  }
  if (outputKind === "CALIBRATION") throw conflict("Use the template calibration endpoint to print a calibration sheet.");

  const pdf = template
    ? await renderTemplateOutput(template, [row], outputKind as Exclude<TemplateOutputKind, "CALIBRATION">, layout, {
      ...(slotIndex !== undefined ? { slotIndexes: [slotIndex], pageCount: 1 } : {}),
    })
    : await renderTicketsPdf([row]);
  const record = await prisma.printBatch.create({
    data: {
      kind: isReprint ? "REPRINT" : "PRODUCTION",
      eventId: ticket.eventId,
      ticketId: ticket.id,
      ticketCount: 1,
      actorId: ctx.userId,
      templateId: template?.id ?? null,
      templateVersion: template?.version ?? null,
      sheetLayoutSnapshot: template ? layout as unknown as Prisma.InputJsonObject : undefined,
      outputKind: template ? outputKind as TicketTemplateOutputKind : null,
      metadata: {
        serial: ticket.serial,
        serials: [ticket.serial],
        sourcePrintBatchId: source?.id ?? null,
      },
    },
  });
  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: isReprint ? "ticket.reprint" : "ticket.print",
    targetType: "ticket",
    targetId: ticket.id,
    eventId: ticket.eventId,
    summary: {
      serial: ticket.serial,
      printBatchId: record.id,
      sourcePrintBatchId: source?.id ?? null,
      templateId: template?.id ?? null,
      templateVersion: template?.version ?? null,
      outputKind: template ? outputKind : null,
    },
  });
  return { pdf, filename: `ksp-${ticket.serial}.pdf`, ticketCount: 1, skipped: 0, printBatchId: record.id };
}
