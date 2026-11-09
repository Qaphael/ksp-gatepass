import { describe, expect, it } from "vitest";
import { sanitizeAuditData } from "@/lib/audit";

describe("audit privacy sanitizer", () => {
  it("redacts common Ugandan phone formats recursively without changing other values", () => {
    const safe = sanitizeAuditData({
      reason: "Called 0772 123 456",
      nested: ["+256 772 123 456", "256772123456", "0772123456"],
      serial: "KSP-000123",
      amountUgx: 12_000,
    });
    expect(safe).toEqual({
      reason: "Called [REDACTED PHONE]",
      nested: ["[REDACTED PHONE]", "[REDACTED PHONE]", "[REDACTED PHONE]"],
      serial: "KSP-000123",
      amountUgx: 12_000,
    });
  });
});
