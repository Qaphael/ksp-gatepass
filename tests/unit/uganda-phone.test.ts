import { describe, expect, it } from "vitest";
import { normalizeUgandaPhone } from "@/lib/phone/uganda";

describe("normalizeUgandaPhone", () => {
  it.each([
    ["0772123456", "+256772123456"],
    ["0772 123 456", "+256772123456"],
    ["+256772123456", "+256772123456"],
    ["256772123456", "+256772123456"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeUgandaPhone(input)).toBe(expected);
  });

  it.each(["", "077212345", "0672123456", "25677212345", "phone 0772123456", "+1 772123456"]) (
    "rejects invalid number %s",
    (input) => expect(() => normalizeUgandaPhone(input)).toThrow("valid Ugandan mobile number"),
  );
});
