import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCsv, csvCell } from "../../src/lib/csv";
import { generateQrToken, hashQrToken } from "../../src/lib/qr/tokens";
import { formatSerial, isSerialFormat } from "../../src/lib/serial";

describe("serial numbers", () => {
  it("formats with the configured prefix and 5-digit padding", () => {
    expect(formatSerial("KSP", 1)).toBe("KSP-00001");
    expect(formatSerial("KSP", 12345)).toBe("KSP-12345");
    // Numbers beyond the padding grow instead of truncating.
    expect(formatSerial("KSP", 123456)).toBe("KSP-123456");
  });

  it("recognises its own output and rejects nonsense", () => {
    expect(isSerialFormat("KSP-00001")).toBe(true);
    expect(isSerialFormat("KSP12-99999")).toBe(true);
    expect(isSerialFormat("KSP-1")).toBe(false);
    expect(isSerialFormat("ksp-00001")).toBe(false);
    expect(isSerialFormat("")).toBe(false);
  });
});

describe("QR tokens", () => {
  it("generates high-entropy URL-safe tokens", () => {
    const token = generateQrToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(new Set(Array.from({ length: 100 }, () => generateQrToken())).size).toBe(100);
  });

  it("stores only the SHA-256 hash of the token", () => {
    const token = generateQrToken();
    const hash = hashQrToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    // The hash never contains the raw token.
    expect(hash).not.toContain(token);
    // Deterministic: re-hashing the submitted token is the lookup path.
    expect(hashQrToken(token)).toBe(hash);
    expect(hashQrToken(generateQrToken())).not.toBe(hash);
  });
});

describe("CSV export safety", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+cmd|'/C calc'!A0")).toBe("'+cmd|'/C calc'!A0");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@user")).toBe("'@user");
    expect(csvCell("\tTAB")).toBe("'\tTAB");
    // Numbers are never treated as formulas.
    expect(csvCell(-5000)).toBe("-5000");
    expect(csvCell(0)).toBe("0");
  });

  it("quotes separators, quotes and newlines per RFC 4180", () => {
    expect(csvCell("Gulu, Uganda")).toBe('"Gulu, Uganda"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("builds a BOM-prefixed document with CRLF rows", () => {
    const csv = buildCsv(["serial", "status"], [["KSP-00001", "AVAILABLE"], ["=evil", null]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toBe("\uFEFFserial,status\r\nKSP-00001,AVAILABLE\r\n'=evil,\r\n");
  });
});
