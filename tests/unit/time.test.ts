import { describe, expect, it } from "vitest";
import {
  assertTimeZone,
  isLocalDateTime,
  localToUtc,
  utcToLocal,
} from "@/lib/time";

const KAMPALA = "Africa/Kampala"; // UTC+3, no daylight saving

describe("timezone helpers", () => {
  it("recognises local datetime strings", () => {
    expect(isLocalDateTime("2026-12-05T18:00")).toBe(true);
    expect(isLocalDateTime("2026-12-05 18:00")).toBe(false);
    expect(isLocalDateTime("2026-12-05T18:00:00")).toBe(false);
    expect(isLocalDateTime("not-a-date")).toBe(false);
  });

  it("rejects unknown timezones", () => {
    expect(() => assertTimeZone("Nowhere/Nothing")).toThrow(RangeError);
    expect(() => assertTimeZone(KAMPALA)).not.toThrow();
  });

  it("converts Kampala wall time to the correct UTC instant", () => {
    const utc = localToUtc("2026-12-05T18:00", KAMPALA);
    expect(utc.toISOString()).toBe("2026-12-05T15:00:00.000Z");
  });

  it("round-trips local → UTC → local", () => {
    for (const local of ["2026-12-05T18:00", "2026-01-01T00:00", "2026-07-15T23:59"]) {
      expect(utcToLocal(localToUtc(local, KAMPALA), KAMPALA)).toBe(local);
    }
  });

  it("round-trips across a different hemisphere timezone", () => {
    const nairobi = "Africa/Nairobi"; // UTC+3 as well
    const local = "2026-03-02T06:30";
    expect(utcToLocal(localToUtc(local, nairobi), nairobi)).toBe(local);
    expect(localToUtc(local, nairobi).toISOString()).toBe("2026-03-02T03:30:00.000Z");
  });

  it("throws on malformed input instead of guessing", () => {
    expect(() => localToUtc("2026-13-45T99:99", KAMPALA)).toThrow(RangeError);
  });
});
