import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultTakeover, type CheckInResult } from "@/components/check-in/result-takeover";

const failureCodes = [
  "INVALID_QR", "UNKNOWN_SERIAL", "OTHER_EVENT", "NOT_PAID", "TICKET_CANCELLED", "TICKET_REVOKED",
  "ALREADY_USED", "NOT_YET_VALID", "EXPIRED", "ADMISSION_CLOSED", "TICKET_NOT_SOLD", "CATEGORY_NOT_ADMISSIBLE",
  "ELIGIBLE", "NETWORK_ERROR",
];

describe("check-in result takeover", () => {
  it.each(failureCodes)("renders %s with failure styling and no admitted success label", (code) => {
    const result: CheckInResult = { code, message: "Example result", admitted: false };
    const html = renderToStaticMarkup(createElement(ResultTakeover, { result, onDismiss: () => undefined }));
    expect(html).toContain('role="alert"');
    expect(html).toContain(code === "NOT_PAID" || code === "NOT_YET_VALID" || code === "EXPIRED" || code === "ADMISSION_CLOSED" || code === "CATEGORY_NOT_ADMISSIBLE" || code === "ELIGIBLE" ? "bg-warning" : "bg-danger");
    expect(html).not.toMatch(/\badmitted\b/i);
    expect(html).not.toContain("bg-success");
  });

  it("renders success styling only for an admitted server result", () => {
    const result: CheckInResult = { code: "ADMITTED", admitted: true, message: "VALID — ADMITTED", checkedInAt: "2026-10-28T10:00:00.000Z", gate: "North", ticket: { serial: "KSP-00001", ticketTypeName: "Standard", eventName: "KSP" } };
    const html = renderToStaticMarkup(createElement(ResultTakeover, { result, onDismiss: () => undefined }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("bg-success");
    expect(html).toContain("VALID — ADMITTED");
    expect(html).toContain("KSP-00001");
  });
});
