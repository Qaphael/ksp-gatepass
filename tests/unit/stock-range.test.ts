import { describe, expect, it } from "vitest";
import { stockIssueSchema } from "../../src/lib/validation/stock";
import { isPlaceholderTemplateConfig, placeholderTicketTemplateConfig, templateConfigKey } from "../../src/lib/validation/ticket-templates";

function issue(selection: unknown) {
  return stockIssueSchema.safeParse({ eventId: "event-1", sellerId: "seller-1", selection });
}

describe("stock issue range validation", () => {
  it("accepts unpadded and padded ranges that describe the same numbers", () => {
    expect(issue({ kind: "RANGE", serialFrom: "KSP-1", serialTo: "KSP-500" }).success).toBe(true);
    expect(issue({ kind: "RANGE", serialFrom: "KSP-00001", serialTo: "KSP-00500" }).success).toBe(true);
    expect(issue({ kind: "RANGE", serialFrom: "ksp-00007", serialTo: "KSP-00007" }).success).toBe(true);
  });

  it("rejects inverted, mixed-prefix and oversized ranges", () => {
    const inverted = issue({ kind: "RANGE", serialFrom: "KSP-10", serialTo: "KSP-9" });
    expect(inverted.success).toBe(false);
    expect(JSON.stringify(inverted.error?.issues)).toContain("KSP-00001");

    expect(issue({ kind: "RANGE", serialFrom: "KSP-1", serialTo: "VIP-500" }).success).toBe(false);
    expect(issue({ kind: "RANGE", serialFrom: "KSP-1", serialTo: "KSP-501" }).success).toBe(false);
    expect(issue({ kind: "RANGE", serialFrom: "", serialTo: "KSP-500" }).success).toBe(false);
  });
});

describe("ticket template config comparison", () => {
  it("ignores key order, so a jsonb round-trip is not an edit", () => {
    const config = placeholderTicketTemplateConfig();
    const reordered = JSON.parse(
      JSON.stringify({ fonts: config.fonts, stub: config.stub, bottomStrip: config.bottomStrip, qr: config.qr, perforationXMm: config.perforationXMm, bleedMm: config.bleedMm, trim: config.trim, schemaVersion: config.schemaVersion }),
    ) as unknown;
    expect(templateConfigKey(reordered)).toBe(templateConfigKey(config));
    expect(isPlaceholderTemplateConfig(reordered)).toBe(true);
  });

  it("detects a measured config", () => {
    const config = placeholderTicketTemplateConfig();
    const measured = { ...config, qr: { ...config.qr, xMm: 151.5 } };
    expect(isPlaceholderTemplateConfig(measured)).toBe(false);
    expect(templateConfigKey(measured)).not.toBe(templateConfigKey(config));
  });
});
