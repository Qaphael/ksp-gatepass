import { describe, expect, it } from "vitest";
import { addCartTicket, removeCartTicket, SALE_LOOKUP_PRESENTATION, type SaleLookupState, type ScanCartTicket } from "@/components/sales/scan-to-sell-model";

const states: SaleLookupState[] = ["SALEABLE", "INVALID_QR", "UNKNOWN_SERIAL", "OTHER_EVENT", "ALREADY_SOLD", "ISSUED_TO_ANOTHER_SELLER", "NOT_ISSUED_TO_YOU", "TICKET_CANCELLED", "TICKET_REVOKED", "SALES_CLOSED", "TICKET_TYPE_INACTIVE", "EVENT_NOT_SELLING"];
const ticket = (serial: string, entryMethod: ScanCartTicket["entryMethod"] = "SCAN"): ScanCartTicket => ({ serial, ticketTypeName: "General", priceUgx: 25000, entryMethod, token: entryMethod === "SCAN" ? `token-${serial}` : undefined });

describe("scan-to-sell lookup presentation", () => {
  it("gives every server state its own message and icon", () => {
    const entries = states.map((state) => SALE_LOOKUP_PRESENTATION[state]);
    expect(new Set(entries.map((entry) => entry.message)).size).toBe(states.length);
    expect(new Set(entries.map((entry) => entry.icon)).size).toBe(states.length);
  });

  it("styles only saleable results as success", () => {
    for (const state of states) {
      if (state === "SALEABLE") expect(SALE_LOOKUP_PRESENTATION[state].tone).toBe("success");
      else expect(SALE_LOOKUP_PRESENTATION[state].tone).not.toBe("success");
    }
  });
});

describe("scan-to-sell cart", () => {
  it("does not add the same serial twice, even with different casing", () => {
    const cart = addCartTicket([ticket("KSP-00001")], ticket("ksp-00001", "MANUAL"));
    expect(cart).toHaveLength(1);
    expect(cart[0].entryMethod).toBe("SCAN");
  });

  it("adds distinct tickets and removes by serial", () => {
    const cart = addCartTicket([ticket("KSP-00001")], ticket("KSP-00002", "MANUAL"));
    expect(cart).toHaveLength(2);
    expect(removeCartTicket(cart, "ksp-00001").map(({ serial }) => serial)).toEqual(["KSP-00002"]);
  });
});
