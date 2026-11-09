import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import QRDecoder from "@zxing/library/esm/core/qrcode/decoder/Decoder";
import { PDFArray, PDFDocument, PDFRawStream, PDFRef, PDFStream } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import QRCode from "qrcode";
import sharp from "sharp";
import { createTemplateSheetLayout, qrPathForToken, renderTemplateCalibrationPdf, renderTemplateTicketsPdf } from "@/lib/pdf/ticket-template";
import type { TicketPrintRow } from "@/lib/pdf/ticket";
import { placeholderTicketTemplateConfig, ticketTemplateConfigSchema } from "@/lib/validation/ticket-templates";

Object.assign(globalThis, {
  DOMMatrix: globalThis.DOMMatrix ?? DOMMatrix,
  ImageData: globalThis.ImageData ?? ImageData,
  Path2D: globalThis.Path2D ?? Path2D,
});

const MM_PER_PT = 25.4 / 72;
const templateConfig = () => {
  const config = placeholderTicketTemplateConfig();
  config.fonts = { primary: "Source Sans 3", mono: "Source Code Pro" };
  config.bottomStrip.fields = [
    { key: "serial", xMm: 2, yMm: 1, maxWidthMm: 48, font: "mono", sizePt: 12, weight: "bold", color: "#14201B", align: "left", uppercase: false, letterSpacingPt: 0.2, enabled: true },
    { key: "category", xMm: 52, yMm: 1, maxWidthMm: 44, font: "primary", sizePt: 10, weight: "bold", color: "#0F3D2E", align: "center", uppercase: false, letterSpacingPt: 0, enabled: true },
    { key: "price", xMm: 102, yMm: 1, maxWidthMm: 44, font: "primary", sizePt: 9, weight: "regular", color: "#14201B", align: "right", uppercase: false, letterSpacingPt: 0, enabled: true },
  ];
  config.stub.fields = [
    { key: "eventDate", xMm: 1, yMm: 20, maxWidthMm: 18, font: "mono", sizePt: 8, weight: "regular", color: "#14201B", align: "left", uppercase: true, letterSpacingPt: 0, enabled: true },
  ];
  return ticketTemplateConfigSchema.parse(config);
};

const artworkPromise = sharp({
  create: { width: 2160, height: 650, channels: 3, background: "#D8C49A" },
}).png().toBuffer();

function ticketRow(index = 0): TicketPrintRow {
  return {
    serial: `KSP-PRINT-${String(index + 1).padStart(5, "0")}`,
    token: Buffer.from(`real-ticket-token-${String(index).padStart(8, "0")}`).toString("base64url").padEnd(43, "x").slice(0, 43),
    ticketTypeName: "Standard",
    printLabel: "VIP",
    ticketPriceUgx: 50_000,
    event: {
      name: "KSP Music Night",
      venue: "KSP Hotel Gulu",
      address: "Plot 4",
      eventDate: "2026-12-05",
      startTime: "18:00",
      endTime: "23:00",
      accentColor: "#0F3D2E",
      ticketFooterText: "Keep this ticket safe",
      organiserContact: "+256700000000",
    },
  };
}

async function imageObjectCount(doc: PDFDocument): Promise<number> {
  let count = 0;
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (object.dict.entries().some(([key, value]) => key.toString() === "/Subtype" && value.toString() === "/Image")) count++;
  }
  return count;
}

function pageContentBytes(doc: PDFDocument, pageIndex: number): string {
  const contents = doc.getPages()[pageIndex].node.Contents();
  const references = contents instanceof PDFArray ? contents.asArray() : [contents];
  return references.map((reference) => {
    const stream = doc.context.lookup(reference as PDFRef, PDFStream);
    return Buffer.from(stream.getContents()).toString("base64");
  }).join(":");
}

describe("ticket template PDF renderer", () => {
  it("renders configurable A4 sheets and reuses one artwork image object", async () => {
    const config = templateConfig();
    const artwork = { data: await artworkPromise, format: "png" as const };
    const rows = Array.from({ length: 6 }, (_, index) => ticketRow(index));
    const layout = createTemplateSheetLayout("SHEET", { ticketsPerPage: 5, scale: 0.94 });
    const first = await renderTemplateTicketsPdf({ config, artwork, rows, outputKind: "SHEET", layout });
    const repeated = await renderTemplateTicketsPdf({ config, artwork, rows, outputKind: "SHEET", layout });
    const doc = await PDFDocument.load(first);
    const repeatDoc = await PDFDocument.load(repeated);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPages()[0].getWidth() * MM_PER_PT).toBeCloseTo(210, 2);
    expect(doc.getPages()[0].getHeight() * MM_PER_PT).toBeCloseTo(297, 2);
    expect(await imageObjectCount(doc)).toBe(1);
    expect(pageContentBytes(doc, 0)).toBe(pageContentBytes(repeatDoc, 0));
    expect(first.byteLength).toBeLessThan((await artworkPromise).byteLength * 5 + 5 * 1024 * 1024);

    const compactLayout = createTemplateSheetLayout("SHEET", { ticketsPerPage: 2, scale: 0.8 });
    const compact = await renderTemplateTicketsPdf({ config, artwork, rows, outputKind: "SHEET", layout: compactLayout });
    const compactDoc = await PDFDocument.load(compact);
    expect(compactDoc.getPageCount()).toBe(3);
    expect(compactDoc.getPages()[0].getWidth() * MM_PER_PT).toBeCloseTo(210, 2);
    expect(await imageObjectCount(compactDoc)).toBe(1);
  });

  it("renders 100% single-ticket pages with bleed and a transparent data-only layer", async () => {
    const config = templateConfig();
    const artwork = { data: await artworkPromise, format: "png" as const };
    const row = ticketRow();
    const singleLayout = createTemplateSheetLayout("SINGLE", { cropMarks: true });
    const single = await renderTemplateTicketsPdf({ config, artwork, rows: [row], outputKind: "SINGLE", layout: singleLayout });
    const singleDoc = await PDFDocument.load(single);
    expect(singleDoc.getPageCount()).toBe(1);
    expect(singleDoc.getPages()[0].getWidth() * MM_PER_PT).toBeCloseTo(216, 2);
    expect(singleDoc.getPages()[0].getHeight() * MM_PER_PT).toBeCloseTo(65, 2);
    expect(await imageObjectCount(singleDoc)).toBe(1);

    const dataLayout = createTemplateSheetLayout("DATA_LAYER");
    const dataLayer = await renderTemplateTicketsPdf({ config, rows: [row], outputKind: "DATA_LAYER", layout: dataLayout });
    const dataDoc = await PDFDocument.load(dataLayer);
    expect(dataDoc.getPages()[0].getWidth() * MM_PER_PT).toBeCloseTo(216, 2);
    expect(dataDoc.getPages()[0].getHeight() * MM_PER_PT).toBeCloseTo(65, 2);
    expect(await imageObjectCount(dataDoc)).toBe(0);
    expect(dataLayer.byteLength).toBeLessThan(1024 * 1024);
  });

  it("blocks a QR below the printed size minimum and decodes the rendered QR to the exact token", async () => {
    const config = templateConfig();
    const artwork = { data: await artworkPromise, format: "png" as const };
    const row = ticketRow();
    const tooSmall = createTemplateSheetLayout("SHEET", { ticketsPerPage: 5, scale: 0.6 });
    await expect(renderTemplateTicketsPdf({ config, artwork, rows: [row], outputKind: "SHEET", layout: tooSmall }))
      .rejects.toThrow(/Printed QR size/);

    const layout = createTemplateSheetLayout("SHEET", { ticketsPerPage: 5, scale: 0.94 });
    const pdf = await renderTemplateTicketsPdf({ config, artwork, rows: [row], outputKind: "SHEET", layout });
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdf) });
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 4 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvas: canvas as never, viewport }).promise;
    const scale = 0.94;
    const pagePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const sheetTopMm = (297 - 59 * scale * 5) / 2;
    const sheetLeftMm = (210 - 210 * scale) / 2;
    const qrModules = qrPathForToken(row.token).modules;
    const expectedModules = QRCode.create(row.token, { errorCorrectionLevel: "M" }).modules;
    const modulePx = (30 * scale * 72 / 25.4 * 4) / (qrModules + 8);
    const qrLeftPx = (sheetLeftMm + 155 * scale) * 72 / 25.4 * 4;
    const qrTopPx = (sheetTopMm + 5 * scale) * 72 / 25.4 * 4;
    let grid = { errors: qrModules * qrModules, left: qrLeftPx + 4 * modulePx, top: qrTopPx + 4 * modulePx, cell: modulePx };
    searchGrid: for (let cell = modulePx - 0.5; cell <= modulePx + 0.5; cell += 0.1) {
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
        const left = qrLeftPx + 4 * cell + dx;
        const top = qrTopPx + 4 * cell + dy;
        let errors = 0;
        for (let y = 0; y < qrModules && errors < grid.errors; y++) for (let x = 0; x < qrModules; x++) {
          const pixelX = Math.floor(left + (x + 0.5) * cell);
          const pixelY = Math.floor(top + (y + 0.5) * cell);
          const index = (pixelY * canvas.width + pixelX) * 4;
          const dark = (pagePixels[index] * 0.299 + pagePixels[index + 1] * 0.587 + pagePixels[index + 2] * 0.114) < 128;
          if (dark !== (expectedModules.data[y * qrModules + x] === 1)) errors++;
        }
        if (errors < grid.errors) grid = { errors, left, top, cell };
        if (errors === 0) break searchGrid;
      }
    }
    const moduleBits: boolean[][] = [];
    for (let moduleY = 0; moduleY < qrModules; moduleY++) {
      moduleBits.push([]);
      for (let moduleX = 0; moduleX < qrModules; moduleX++) {
        const pixelX = Math.floor(grid.left + (moduleX + 0.5) * grid.cell);
        const pixelY = Math.floor(grid.top + (moduleY + 0.5) * grid.cell);
        const pixelIndex = (pixelY * canvas.width + pixelX) * 4;
        const luminance = pagePixels[pixelIndex] * 0.299 + pagePixels[pixelIndex + 1] * 0.587 + pagePixels[pixelIndex + 2] * 0.114;
        moduleBits[moduleY].push(luminance < 128);
      }
    }
    expect(grid.errors).toBe(0);
    expect(moduleBits.flat().every((value, index) => value === (expectedModules.data[index] === 1))).toBe(true);
    expect(new QRDecoder().decodeBooleanArray(moduleBits).getText()).toBe(row.token);
    await loadingTask.destroy();
  }, 30_000);

  it("creates a calibration sheet with ruler, outlines and a non-ticket test QR", async () => {
    const config = templateConfig();
    const artwork = { data: await artworkPromise, format: "png" as const };
    const testToken = `CALIBRATION-QR-NOT-A-REAL-TICKET-${"x".repeat(10)}`.slice(0, 43);
    const calibration = await renderTemplateCalibrationPdf({ config, artwork, testToken });
    const doc = await PDFDocument.load(calibration.pdf);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPages()[0].getWidth() * MM_PER_PT).toBeCloseTo(210, 2);
    expect(doc.getPages()[0].getHeight() * MM_PER_PT).toBeCloseTo(297, 2);
    expect(calibration.testToken).toBe(testToken);
    expect(calibration.pdf.includes(Buffer.from(testToken))).toBe(false);
    expect(await imageObjectCount(doc)).toBe(1);
    expect(qrPathForToken(testToken).path.length).toBeGreaterThan(1_000);

    await expect(renderTemplateCalibrationPdf({
      config: placeholderTicketTemplateConfig(),
      artwork,
    })).resolves.toMatchObject({ pdf: expect.any(Buffer) });
  });
});

afterAll(() => {
  // Avoid keeping PDF.js's worker machinery alive after the unit file ends.
  vi.restoreAllMocks();
});
