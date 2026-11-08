import { describe, expect, it } from "vitest";
import { placeholderTicketTemplateConfig, ticketTemplateConfigSchema } from "@/lib/validation/ticket-templates";

describe("ticket template config", () => {
  it("accepts the measured ticket shape and validates QR minimums at 94% A4 scale", () => {
    const parsed = ticketTemplateConfigSchema.safeParse(placeholderTicketTemplateConfig());
    expect(parsed.success).toBe(true);
  });

  it("rejects zones outside trim and QR zones below the printed minimum", () => {
    const outside = placeholderTicketTemplateConfig();
    outside.qr.xMm = 190;
    expect(ticketTemplateConfigSchema.safeParse(outside).success).toBe(false);

    const tooSmall = placeholderTicketTemplateConfig();
    tooSmall.qr.sizeMm = 21;
    expect(ticketTemplateConfigSchema.safeParse(tooSmall).success).toBe(false);
  });

  it("rejects unknown field keys, file paths as font refs, and fields that exceed their zone", () => {
    const unknownField = placeholderTicketTemplateConfig();
    unknownField.bottomStrip.fields = [{
      key: "qrToken" as never, xMm: 1, yMm: 1, maxWidthMm: 10, font: "mono", sizePt: 8,
      weight: "regular", color: "#000000", align: "left", uppercase: false,
      letterSpacingPt: 0, enabled: true,
    }];
    expect(ticketTemplateConfigSchema.safeParse(unknownField).success).toBe(false);

    const pathFont = placeholderTicketTemplateConfig();
    pathFont.fonts.primary = "../private/font.ttf";
    expect(ticketTemplateConfigSchema.safeParse(pathFont).success).toBe(false);

    const oversizedField = placeholderTicketTemplateConfig();
    oversizedField.bottomStrip.fields = [{
      key: "serial", xMm: 0, yMm: 0, maxWidthMm: 151, font: "mono", sizePt: 8,
      weight: "regular", color: "#000000", align: "left", uppercase: false,
      letterSpacingPt: 0, enabled: true,
    }];
    expect(ticketTemplateConfigSchema.safeParse(oversizedField).success).toBe(false);
  });

  it("rejects unsupported schema versions and non-positive dimensions", () => {
    const badVersion = { ...placeholderTicketTemplateConfig(), schemaVersion: 2 };
    expect(ticketTemplateConfigSchema.safeParse(badVersion).success).toBe(false);
    const badPanel = placeholderTicketTemplateConfig();
    badPanel.qr.panel.radiusMm = -1;
    expect(ticketTemplateConfigSchema.safeParse(badPanel).success).toBe(false);
  });
});
