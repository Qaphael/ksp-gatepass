import "server-only";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  degrees,
  rgb,
  type PDFImage,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { formatEventDate } from "@/lib/pdf/ticket";
import { formatEventTimeRange } from "@/lib/time";
import {
  QR_MIN_MODULE_SIZE_MM,
  QR_MIN_PRINTED_SIZE_MM,
  TEMPLATE_A4_SCALE,
  ticketTemplateConfigSchema,
  type TicketTemplateConfig,
} from "@/lib/validation/ticket-templates";
import type { TicketPrintRow } from "./ticket";

const PT_PER_MM = 72 / 25.4;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const CUT_COLOR = rgb(0.28, 0.32, 0.3);
const CALIBRATION_COLOR = rgb(0.8, 0.12, 0.42);
const QR_GUIDE_COLOR = rgb(0.04, 0.35, 0.65);
const STRIP_GUIDE_COLOR = rgb(0.58, 0.31, 0.02);
const STUB_GUIDE_COLOR = rgb(0.35, 0.2, 0.56);
const FIELD_GUIDE_COLOR = rgb(0.78, 0.05, 0.12);
const CALIBRATION_QR_TOKEN_PREFIX = "KSP-CALIBRATION-NOT-A-REAL-TICKET-";

export type TemplateOutputKind = "SHEET" | "SINGLE" | "DATA_LAYER" | "CALIBRATION";
export type TicketRowSlot = TicketPrintRow | null;

export interface TemplateSheetLayout {
  outputKind: TemplateOutputKind;
  pageSize: "A4" | "TICKET_WITH_BLEED";
  ticketsPerPage: number;
  scale: number;
  cropMarks: boolean;
  includeBleed: boolean;
}

export interface TemplateLayoutOptions {
  ticketsPerPage?: number;
  scale?: number;
  cropMarks?: boolean;
}

export interface TemplateArtwork {
  data: Buffer;
  format: "png" | "jpeg";
}

export interface TemplateRenderRequest {
  config: unknown;
  artwork?: TemplateArtwork;
  rows: TicketRowSlot[];
  outputKind: Exclude<TemplateOutputKind, "CALIBRATION">;
  layout: TemplateSheetLayout;
  /** Original row slots, used when reprinting one item from a sheet. */
  slotIndexes?: number[];
  /** Original page count, retained when a reprint has since-revoked gaps. */
  pageCount?: number;
}

export interface TemplateCalibrationRequest {
  config: unknown;
  artwork: TemplateArtwork;
  /** Injectable only so tests can prove the QR is not persisted or printed as text. */
  testToken?: string;
}

interface EmbeddedFonts {
  primary: { regular: PDFFont; bold: PDFFont };
  mono: { regular: PDFFont; bold: PDFFont };
}

const FONT_FILES = {
  primary: {
    regular: "SourceSans3-Regular.ttf",
    bold: "SourceSans3-Bold.ttf",
  },
  mono: {
    regular: "SourceCodePro-Regular.ttf",
    bold: "SourceCodePro-Bold.ttf",
  },
} as const;

const fontBytes = new Map<string, Promise<Buffer>>();

function mm(value: number): number {
  return value * PT_PER_MM;
}

function hexColor(value: string) {
  return rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );
}

function resolveFontFamily(config: TicketTemplateConfig, kind: "primary" | "mono"): "primary" | "mono" {
  const reference = config.fonts[kind].toLocaleLowerCase();
  if (kind === "primary" && ["primary", "source sans 3", "source sans"].includes(reference)) return "primary";
  if (kind === "mono" && ["mono", "source code pro", "source code"].includes(reference)) return "mono";
  throw new Error(`Unsupported bundled ticket font reference: ${config.fonts[kind]}`);
}

async function fontFile(name: string): Promise<Buffer> {
  let loaded = fontBytes.get(name);
  if (!loaded) {
    // Docker copies assets/fonts explicitly; process.cwd() is /app in the runner.
    loaded = readFile(path.join(process.cwd(), "assets", "fonts", name));
    fontBytes.set(name, loaded);
  }
  return loaded;
}

async function embedFonts(doc: PDFDocument, config: TicketTemplateConfig): Promise<EmbeddedFonts> {
  doc.registerFontkit(fontkit);
  const embed = async (kind: "primary" | "mono", weight: "regular" | "bold") => {
    const family = resolveFontFamily(config, kind);
    const bytes = await fontFile(FONT_FILES[family][weight]);
    return doc.embedFont(bytes, { subset: true });
  };
  const [primaryRegular, primaryBold, monoRegular, monoBold] = await Promise.all([
    embed("primary", "regular"), embed("primary", "bold"),
    embed("mono", "regular"), embed("mono", "bold"),
  ]);
  return {
    primary: { regular: primaryRegular, bold: primaryBold },
    mono: { regular: monoRegular, bold: monoBold },
  };
}

export function createTemplateSheetLayout(
  outputKind: Exclude<TemplateOutputKind, "CALIBRATION">,
  options: TemplateLayoutOptions = {},
): TemplateSheetLayout {
  if (outputKind === "SHEET") {
    const ticketsPerPage = options.ticketsPerPage ?? 5;
    const scale = options.scale ?? TEMPLATE_A4_SCALE;
    if (!Number.isInteger(ticketsPerPage) || ticketsPerPage < 1 || ticketsPerPage > 10) {
      throw new Error("A sheet must contain between 1 and 10 tickets per page.");
    }
    if (!Number.isFinite(scale) || scale < 0.1 || scale > 1) {
      throw new Error("Sheet scale must be between 0.1 and 1.");
    }
    const ticketWidth = 210 * scale;
    const ticketHeight = 59 * scale;
    if (ticketWidth > A4_WIDTH_MM || ticketHeight * ticketsPerPage > A4_HEIGHT_MM) {
      throw new Error("The selected tickets-per-page and scale do not fit on A4.");
    }
    return {
      outputKind,
      pageSize: "A4",
      ticketsPerPage,
      scale,
      cropMarks: false,
      includeBleed: false,
    };
  }
  return {
    outputKind,
    pageSize: "TICKET_WITH_BLEED",
    ticketsPerPage: 1,
    scale: 1,
    cropMarks: outputKind === "SINGLE" && (options.cropMarks ?? false),
    includeBleed: true,
  };
}

function validateConfig(value: unknown): TicketTemplateConfig {
  const parsed = ticketTemplateConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error("Ticket template configuration is invalid.");
  return parsed.data;
}

function qrData(token: string): { path: string; modules: number } {
  const matrix = QRCode.create(token, { errorCorrectionLevel: "M" }).modules;
  let pathData = "";
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.data[y * matrix.size + x]) {
        // Add the four-module quiet zone required by the print rule.
        const quietX = x + 4;
        const quietY = y + 4;
      pathData += `M${quietX} ${quietY}h1v1h-1z`;
      }
    }
  }
  return { path: pathData, modules: matrix.size };
}

export function qrPathForToken(token: string): { path: string; modules: number } {
  return qrData(token);
}

export function assertQrPrintSize(config: TicketTemplateConfig, scale: number, token: string): void {
  const qr = qrData(token);
  const printedSizeMm = config.qr.sizeMm * scale;
  const moduleSizeMm = printedSizeMm / (qr.modules + 8);
  if (printedSizeMm < QR_MIN_PRINTED_SIZE_MM) {
    throw new Error(`Printed QR size ${printedSizeMm.toFixed(2)} mm is below the ${QR_MIN_PRINTED_SIZE_MM} mm minimum.`);
  }
  if (moduleSizeMm < QR_MIN_MODULE_SIZE_MM) {
    throw new Error(`Printed QR module size ${moduleSizeMm.toFixed(3)} mm is below the ${QR_MIN_MODULE_SIZE_MM} mm minimum.`);
  }
  const panelPadding = config.qr.panel.enabled ? config.qr.panel.paddingMm : 0;
  if (
    config.qr.xMm - panelPadding < 0 || config.qr.yMm - panelPadding < 0 ||
    config.qr.xMm + config.qr.sizeMm + panelPadding > config.trim.widthMm ||
    config.qr.yMm + config.qr.sizeMm + panelPadding > config.trim.heightMm
  ) {
    throw new Error("The QR and its light panel must fit inside the ticket trim box.");
  }
}

function roundedRectPath(width: number, height: number, requestedRadius: number): string {
  const radius = Math.max(0, Math.min(requestedRadius, width / 2, height / 2));
  if (radius === 0) return `M0 0H${width}V${height}H0Z`;
  const c = radius * 0.55228475;
  return [
    `M${radius} 0`, `H${width - radius}`,
    `C${width - radius + c} 0 ${width} ${radius - c} ${width} ${radius}`,
    `V${height - radius}`,
    `C${width} ${height - radius + c} ${width - radius + c} ${height} ${width - radius} ${height}`,
    `H${radius}`,
    `C${radius - c} ${height} 0 ${height - radius + c} 0 ${height - radius}`,
    `V${radius}`,
    `C0 ${radius - c} ${radius - c} 0 ${radius} 0Z`,
  ].join(" ");
}

async function cropTrimArtwork(config: TicketTemplateConfig, artwork: TemplateArtwork): Promise<TemplateArtwork> {
  const metadata = await sharp(artwork.data, { failOn: "error", sequentialRead: true }).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Ticket template artwork has no image dimensions.");
  const fullWidth = config.trim.widthMm + 2 * config.bleedMm;
  const fullHeight = config.trim.heightMm + 2 * config.bleedMm;
  const left = Math.round((config.bleedMm / fullWidth) * metadata.width);
  const top = Math.round((config.bleedMm / fullHeight) * metadata.height);
  const width = metadata.width - left * 2;
  const height = metadata.height - top * 2;
  const pipeline = sharp(artwork.data, { failOn: "error", sequentialRead: true })
    .extract({ left, top, width, height });
  const data = artwork.format === "png"
    ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
    : await pipeline.jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toBuffer();
  return { data, format: artwork.format };
}

async function embedImage(doc: PDFDocument, artwork: TemplateArtwork): Promise<PDFImage> {
  return artwork.format === "png" ? doc.embedPng(artwork.data) : doc.embedJpg(artwork.data);
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number, spacing: number): string {
  const widthOf = (value: string) => font.widthOfTextAtSize(value, size) + Math.max(0, value.length - 1) * spacing;
  if (widthOf(text) <= maxWidth) return text;
  const ellipsis = "…";
  let result = "";
  for (const character of text) {
    if (widthOf(result + character + ellipsis) > maxWidth) break;
    result += character;
  }
  return result ? result + ellipsis : "";
}

function fieldValue(key: string, row: TicketPrintRow): string {
  switch (key) {
    case "serial": return row.serial;
    case "category": return row.printLabel ?? row.ticketTypeName;
    case "price": return row.ticketPriceUgx === undefined ? "" : `UGX ${row.ticketPriceUgx.toLocaleString("en-UG")}`;
    case "eventName": return row.event.name;
    case "eventDate": return formatEventDate(row.event.eventDate);
    case "eventTime": return formatEventTimeRange(row.event.startTime, row.event.endTime);
    case "venue": return row.event.address ? `${row.event.venue}, ${row.event.address}` : row.event.venue;
    case "footerText": return row.event.ticketFooterText ?? "";
    case "organiserContact": return row.event.organiserContact ?? "";
    case "authNotice": return "Valid only after verification at the gate.";
    default: return "";
  }
}

function alignOffset(align: "left" | "center" | "right", maxWidth: number, textWidth: number): number {
  if (align === "right") return Math.max(0, maxWidth - textWidth);
  if (align === "center") return Math.max(0, (maxWidth - textWidth) / 2);
  return 0;
}

function drawTrackedText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  color: ReturnType<typeof rgb>,
  rotation: number,
  spacing: number,
): void {
  if (spacing === 0 || text.length < 2) {
    page.drawText(text, { x, y, font, size, color, rotate: degrees(rotation) });
    return;
  }
  const radians = (rotation * Math.PI) / 180;
  let cursor = 0;
  for (const character of text) {
    page.drawText(character, {
      x: x + Math.cos(radians) * cursor,
      y: y + Math.sin(radians) * cursor,
      font,
      size,
      color,
      rotate: degrees(rotation),
    });
    cursor += font.widthOfTextAtSize(character, size) + spacing;
  }
}

function drawField(
  page: PDFPage,
  field: TicketTemplateConfig["bottomStrip"]["fields"][number],
  row: TicketPrintRow,
  config: TicketTemplateConfig,
  fonts: EmbeddedFonts,
  ticketLeftMm: number,
  ticketTopMm: number,
  pageHeight: number,
  scale: number,
  zone: TicketTemplateConfig["bottomStrip"] | TicketTemplateConfig["stub"],
  rotation: number,
): void {
  const value = fieldValue(field.key, row);
  if (!field.enabled || !value) return;
  const family = resolveFontFamily(config, field.font);
  const font = fonts[family][field.weight];
  const size = field.sizePt * scale;
  const maxWidth = mm(field.maxWidthMm) * scale;
  const text = fitText(field.uppercase ? value.toLocaleUpperCase() : value, font, size, maxWidth, field.letterSpacingPt * scale);
  if (!text) return;
  const measuredWidth = font.widthOfTextAtSize(text, size) + Math.max(0, text.length - 1) * field.letterSpacingPt * scale;
  const horizontalOffset = alignOffset(field.align, maxWidth, measuredWidth);
  const localX = ticketLeftMm + zone.xMm + field.xMm;
  const localTop = ticketTopMm + zone.yMm + field.yMm;
  let x: number;
  let y: number;
  if (rotation === 90) {
    x = mm(localX + (field.sizePt * 25.4 / 72)) * scale;
    y = pageHeight - mm(localTop + field.maxWidthMm - horizontalOffset) * scale;
  } else if (rotation === 270) {
    x = mm(localX) * scale;
    y = pageHeight - mm(localTop + horizontalOffset) * scale;
  } else {
    x = mm(localX) * scale + horizontalOffset;
    y = pageHeight - mm(localTop) * scale - size;
  }
  drawTrackedText(page, text, font, size, x, y, hexColor(field.color), rotation, field.letterSpacingPt * scale);
}

function drawQr(
  page: PDFPage,
  token: string,
  config: TicketTemplateConfig,
  ticketLeftMm: number,
  ticketTopMm: number,
  pageHeight: number,
  scale: number,
): void {
  assertQrPrintSize(config, scale, token);
  const { path: matrixPath, modules } = qrData(token);
  const quietModules = modules + 8;
  const qrX = ticketLeftMm + config.qr.xMm;
  const qrTop = ticketTopMm + config.qr.yMm;
  const qrSize = config.qr.sizeMm;
  const padding = config.qr.panel.enabled ? config.qr.panel.paddingMm : 0;
  if (config.qr.panel.enabled) {
    const panelSize = qrSize + padding * 2;
    const panelLeft = qrX - padding;
    const panelTop = qrTop - padding;
    page.drawSvgPath(roundedRectPath(panelSize, panelSize, config.qr.panel.radiusMm), {
      x: mm(panelLeft) * scale,
      y: pageHeight - mm(panelTop) * scale,
      scale: PT_PER_MM * scale,
      color: hexColor(config.qr.panel.color),
    });
  }
  page.drawSvgPath(matrixPath, {
    x: mm(qrX) * scale,
    y: pageHeight - mm(qrTop) * scale,
    scale: (mm(qrSize) * scale) / quietModules,
    color: rgb(0, 0, 0),
  });
}

function drawTemplateFields(
  page: PDFPage,
  row: TicketPrintRow,
  config: TicketTemplateConfig,
  fonts: EmbeddedFonts,
  ticketLeftMm: number,
  ticketTopMm: number,
  pageHeight: number,
  scale: number,
): void {
  drawQr(page, row.token, config, ticketLeftMm, ticketTopMm, pageHeight, scale);
  for (const field of config.bottomStrip.fields) {
    drawField(page, field, row, config, fonts, ticketLeftMm, ticketTopMm, pageHeight, scale, config.bottomStrip, 0);
  }
  for (const field of config.stub.fields) {
    drawField(page, field, row, config, fonts, ticketLeftMm, ticketTopMm, pageHeight, scale, config.stub, config.stub.rotation);
  }
}

function drawCutGuides(page: PDFPage, pageHeight: number, leftMm: number, topMm: number, ticketsPerPage: number, scale: number): void {
  const width = mm(210 * scale);
  for (let line = 0; line <= ticketsPerPage; line++) {
    const yMm = topMm + line * 59 * scale;
    const y = pageHeight - mm(yMm);
    page.drawLine({
      start: { x: mm(leftMm), y },
      end: { x: mm(leftMm) + width, y },
      thickness: 0.45,
      color: CUT_COLOR,
      dashArray: [mm(1.5) * scale, mm(1.2) * scale],
    });
  }
}

function drawPerforation(page: PDFPage, config: TicketTemplateConfig, ticketLeftMm: number, ticketTopMm: number, pageHeight: number, scale: number): void {
  if (config.perforationXMm === null) return;
  const x = mm(ticketLeftMm + config.perforationXMm) * scale;
  const yTop = mm(ticketTopMm) * scale;
  const height = mm(config.trim.heightMm) * scale;
  page.drawLine({
    start: { x, y: pageHeight - yTop },
    end: { x, y: pageHeight - yTop - height },
    thickness: 0.45,
    color: CUT_COLOR,
    dashArray: [mm(1.5) * scale, mm(1.2) * scale],
  });
}

function drawCropMarks(page: PDFPage, config: TicketTemplateConfig, pageHeight: number): void {
  const left = config.bleedMm;
  const top = config.bleedMm;
  const right = left + config.trim.widthMm;
  const bottom = top + config.trim.heightMm;
  const gap = 0.5;
  const length = 2;
  const mark = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({
    start: { x: mm(x1), y: pageHeight - mm(y1) },
    end: { x: mm(x2), y: pageHeight - mm(y2) },
    thickness: 0.35,
    color: CUT_COLOR,
  });
  for (const x of [left, right]) {
    mark(x, top - gap, x, top - gap - length);
    mark(x, bottom + gap, x, bottom + gap + length);
  }
  for (const y of [top, bottom]) {
    mark(left - gap, y, left - gap - length, y);
    mark(right + gap, y, right + gap + length, y);
  }
}

function drawTicketBackground(page: PDFPage, image: PDFImage, leftMm: number, topMm: number, widthMm: number, heightMm: number, pageHeight: number, scale: number): void {
  page.drawImage(image, {
    x: mm(leftMm) * scale,
    y: pageHeight - mm(topMm + heightMm) * scale,
    width: mm(widthMm) * scale,
    height: mm(heightMm) * scale,
  });
}

export async function renderTemplateTicketsPdf(request: TemplateRenderRequest): Promise<Buffer> {
  const config = validateConfig(request.config);
  if (request.rows.length === 0 || request.rows.every((row) => row === null)) {
    throw new Error("Nothing to print: no printable tickets were supplied.");
  }
  const scale = request.layout.scale;
  for (const row of request.rows) if (row) assertQrPrintSize(config, scale, row.token);

  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc, config);
  let image: PDFImage | undefined;
  if (request.outputKind !== "DATA_LAYER") {
    if (!request.artwork) throw new Error("Artwork is required for this template output.");
    const artwork = request.outputKind === "SHEET" ? await cropTrimArtwork(config, request.artwork) : request.artwork;
    image = await embedImage(doc, artwork);
  }

  if (request.outputKind === "SHEET") {
    const pageWidth = mm(A4_WIDTH_MM);
    const pageHeight = mm(A4_HEIGHT_MM);
    const perPage = request.layout.ticketsPerPage;
    const pageCount = request.pageCount ?? Math.ceil(request.rows.length / perPage);
    const ticketWidth = config.trim.widthMm * scale;
    const ticketHeight = config.trim.heightMm * scale;
    const left = (A4_WIDTH_MM - ticketWidth) / 2;
    const top = (A4_HEIGHT_MM - ticketHeight * perPage) / 2;
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const page = doc.addPage([pageWidth, pageHeight]);
      drawCutGuides(page, pageHeight, left, top, perPage, scale);
      const start = pageIndex * perPage;
      const end = Math.min(request.rows.length, start + perPage);
      for (let rowIndex = start; rowIndex < end; rowIndex++) {
        const row = request.rows[rowIndex];
        if (!row) continue;
        const slotIndex = request.slotIndexes?.[rowIndex] ?? rowIndex;
        const slot = slotIndex % perPage;
        const ticketTop = top + slot * ticketHeight;
        if (image) drawTicketBackground(page, image, left, ticketTop, config.trim.widthMm, config.trim.heightMm, pageHeight, scale);
        drawTemplateFields(page, row, config, fonts, left, ticketTop, pageHeight, scale);
        drawPerforation(page, config, left, ticketTop, pageHeight, scale);
      }
    }
  } else {
    const pageWidthMm = config.trim.widthMm + config.bleedMm * 2;
    const pageHeightMm = config.trim.heightMm + config.bleedMm * 2;
    const pageWidth = mm(pageWidthMm);
    const pageHeight = mm(pageHeightMm);
    for (const row of request.rows) {
      if (!row) continue;
      const page = doc.addPage([pageWidth, pageHeight]);
      if (image) drawTicketBackground(page, image, 0, 0, pageWidthMm, pageHeightMm, pageHeight, 1);
      if (request.outputKind === "SINGLE" && request.layout.cropMarks) drawCropMarks(page, config, pageHeight);
      drawTemplateFields(page, row, config, fonts, config.bleedMm, config.bleedMm, pageHeight, 1);
      drawPerforation(page, config, config.bleedMm, config.bleedMm, pageHeight, 1);
    }
  }

  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

function drawZoneOutline(page: PDFPage, xMm: number, yMm: number, widthMm: number, heightMm: number, pageHeight: number, color = CALIBRATION_COLOR): void {
  page.drawRectangle({
    x: mm(xMm),
    y: pageHeight - mm(yMm + heightMm),
    width: mm(widthMm),
    height: mm(heightMm),
    borderColor: color,
    borderWidth: 0.8,
    borderDashArray: [3, 2],
  });
}

function drawTextFieldOutlines(page: PDFPage, config: TicketTemplateConfig, ticketLeftMm: number, ticketTopMm: number, pageHeight: number, scale: number): void {
  const zones = [
    { zone: config.bottomStrip, rotation: 0 },
    { zone: config.stub, rotation: config.stub.rotation },
  ];
  for (const { zone, rotation } of zones) {
    for (const field of zone.fields) {
      if (!field.enabled) continue;
      const textHeightMm = field.sizePt * 25.4 / 72;
      const widthMm = rotation ? textHeightMm : field.maxWidthMm;
      const heightMm = rotation ? field.maxWidthMm : textHeightMm;
      drawZoneOutline(
        page,
        ticketLeftMm + zone.xMm * scale + field.xMm * scale,
        ticketTopMm + zone.yMm * scale + field.yMm * scale,
        widthMm * scale,
        heightMm * scale,
        pageHeight,
        FIELD_GUIDE_COLOR,
      );
    }
  }
}

function drawRulers(page: PDFPage, ticketLeftMm: number, ticketTopMm: number, config: TicketTemplateConfig, pageHeight: number, scale: number, font: PDFFont): void {
  const width = config.trim.widthMm * scale;
  const height = config.trim.heightMm * scale;
  const rulerTop = ticketTopMm - 7;
  const rulerLeft = ticketLeftMm - 4;
  page.drawLine({ start: { x: mm(ticketLeftMm), y: pageHeight - mm(rulerTop) }, end: { x: mm(ticketLeftMm + width), y: pageHeight - mm(rulerTop) }, thickness: 0.6, color: CALIBRATION_COLOR });
  page.drawLine({ start: { x: mm(rulerLeft), y: pageHeight - mm(ticketTopMm) }, end: { x: mm(rulerLeft), y: pageHeight - mm(ticketTopMm + height) }, thickness: 0.6, color: CALIBRATION_COLOR });
  for (let value = 0; value <= config.trim.widthMm; value += 10) {
    const x = ticketLeftMm + value * scale;
    const lineHeight = value % 50 === 0 ? 2.5 : 1.5;
    page.drawLine({ start: { x: mm(x), y: pageHeight - mm(rulerTop) }, end: { x: mm(x), y: pageHeight - mm(rulerTop - lineHeight) }, thickness: 0.5, color: CALIBRATION_COLOR });
    page.drawText(String(value), { x: mm(x) - 2, y: pageHeight - mm(rulerTop - 3.5), size: 5, font, color: CALIBRATION_COLOR });
  }
  for (let value = 0; value <= config.trim.heightMm; value += 10) {
    const y = ticketTopMm + value * scale;
    const lineWidth = value % 50 === 0 ? 2.5 : 1.5;
    page.drawLine({ start: { x: mm(rulerLeft), y: pageHeight - mm(y) }, end: { x: mm(rulerLeft - lineWidth), y: pageHeight - mm(y) }, thickness: 0.5, color: CALIBRATION_COLOR });
  }
}

export async function renderTemplateCalibrationPdf(request: TemplateCalibrationRequest): Promise<{ pdf: Buffer; layout: TemplateSheetLayout; testToken: string }> {
  const config = validateConfig(request.config);
  const testToken = request.testToken ?? (CALIBRATION_QR_TOKEN_PREFIX + randomBytes(16).toString("hex")).slice(0, 43);
  assertQrPrintSize(config, TEMPLATE_A4_SCALE, testToken);
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc, config);
  const trimmedArtwork = await cropTrimArtwork(config, request.artwork);
  const image = await embedImage(doc, trimmedArtwork);
  const pageWidth = mm(A4_WIDTH_MM);
  const pageHeight = mm(A4_HEIGHT_MM);
  const page = doc.addPage([pageWidth, pageHeight]);
  const scale = TEMPLATE_A4_SCALE;
  const ticketLeft = (A4_WIDTH_MM - config.trim.widthMm * scale) / 2;
  const ticketTop = (A4_HEIGHT_MM - config.trim.heightMm * scale) / 2;
  const calibrationRow: TicketPrintRow = {
    serial: "KSP-00001",
    token: testToken,
    ticketTypeName: "VIP",
    printLabel: "VIP",
    ticketPriceUgx: 50_000,
    event: {
      name: "KSP Hotel Gulu",
      venue: "KSP Hotel Gulu",
      address: null,
      eventDate: "2026-11-10",
      startTime: "19:00",
      endTime: "23:00",
      accentColor: null,
      ticketFooterText: "Thank you for joining us",
      organiserContact: "+256 700 000 000",
    },
  };
  drawTicketBackground(page, image, ticketLeft, ticketTop, config.trim.widthMm, config.trim.heightMm, pageHeight, scale);
  drawTemplateFields(page, calibrationRow, config, fonts, ticketLeft, ticketTop, pageHeight, scale);
  drawZoneOutline(page, ticketLeft + config.bottomStrip.xMm * scale, ticketTop + config.bottomStrip.yMm * scale, config.bottomStrip.widthMm * scale, config.bottomStrip.heightMm * scale, pageHeight, STRIP_GUIDE_COLOR);
  drawZoneOutline(page, ticketLeft + config.stub.xMm * scale, ticketTop + config.stub.yMm * scale, config.stub.widthMm * scale, config.stub.heightMm * scale, pageHeight, STUB_GUIDE_COLOR);
  drawZoneOutline(page, ticketLeft + config.qr.xMm * scale, ticketTop + config.qr.yMm * scale, config.qr.sizeMm * scale, config.qr.sizeMm * scale, pageHeight, QR_GUIDE_COLOR);
  drawTextFieldOutlines(page, config, ticketLeft, ticketTop, pageHeight, scale);
  drawRulers(page, ticketLeft, ticketTop, config, pageHeight, scale, fonts.primary.regular);
  page.drawText("CALIBRATION — RED BOXES = TEXT · BLUE = QR · AMBER = STRIP · PURPLE = STUB · PRINT AT 100% / ACTUAL SIZE", {
    x: mm(12), y: mm(12), size: 10, font: fonts.primary.bold, color: CALIBRATION_COLOR,
  });
  const layout: TemplateSheetLayout = {
    outputKind: "CALIBRATION", pageSize: "A4", ticketsPerPage: 1,
    scale, cropMarks: false, includeBleed: false,
  };
  return { pdf: Buffer.from(await doc.save({ useObjectStreams: false })), layout, testToken };
}
