import { describe, expect, it } from "vitest";
import { loginSchema } from "@/lib/validation/auth";
import { createUserSchema } from "@/lib/validation/users";
import { createEventSchema, updateEventSchema } from "@/lib/validation/events";
import { createTicketTypeSchema } from "@/lib/validation/ticket-types";

const validEvent = {
  name: "KSP Gala Night",
  venue: "KSP Hotel Gulu",
  eventDate: "2026-12-05",
  startTime: "18:00",
  endTime: "23:00",
  capacity: 500,
};

describe("login validation", () => {
  it("rejects an empty identifier", () => {
    expect(loginSchema.safeParse({ identifier: "", password: "x" }).success).toBe(false);
  });

  it("accepts a normal login payload", () => {
    expect(
      loginSchema.safeParse({ identifier: "admin", password: "secret" }).success,
    ).toBe(true);
  });
});

describe("user validation", () => {
  it("normalises usernames to lowercase", () => {
    const parsed = createUserSchema.parse({
      displayName: "Ada",
      username: "Ada.Lovelace",
      role: "SELLER",
      password: "long-enough-pass",
    });
    expect(parsed.username).toBe("ada.lovelace");
  });

  it("rejects usernames with spaces", () => {
    const result = createUserSchema.safeParse({
      displayName: "Ada",
      username: "ada lovelace",
      role: "SELLER",
      password: "long-enough-pass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects passwords shorter than 12 characters", () => {
    const result = createUserSchema.safeParse({
      displayName: "Ada",
      username: "ada",
      role: "SELLER",
      password: "short1",
    });
    expect(result.success).toBe(false);
  });

  it("lowercases email addresses", () => {
    const parsed = createUserSchema.parse({
      displayName: "Ada",
      username: "ada",
      email: "ADA@Example.COM",
      role: "ADMIN",
      password: "long-enough-pass",
    });
    expect(parsed.email).toBe("ada@example.com");
  });

  it("rejects unknown roles", () => {
    const result = createUserSchema.safeParse({
      displayName: "Ada",
      username: "ada",
      role: "SUPERBOSS",
      password: "long-enough-pass",
    });
    expect(result.success).toBe(false);
  });
});

describe("event validation (PRD 5.3)", () => {
  it("accepts a valid event", () => {
    expect(createEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it("rejects an end time not after the start time", () => {
    const result = createEventSchema.safeParse({ ...validEvent, endTime: "18:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("endTime"))).toBe(true);
    }
  });

  it("rejects a non-positive capacity", () => {
    expect(createEventSchema.safeParse({ ...validEvent, capacity: 0 }).success).toBe(false);
    expect(
      createEventSchema.safeParse({ ...validEvent, capacity: -5 }).success,
    ).toBe(false);
  });

  it("rejects a non-existent calendar date", () => {
    expect(
      createEventSchema.safeParse({ ...validEvent, eventDate: "2026-02-31" }).success,
    ).toBe(false);
  });

  it("rejects an unknown timezone", () => {
    expect(
      createEventSchema.safeParse({ ...validEvent, timezone: "Mars/Olympus" }).success,
    ).toBe(false);
  });

  it("rejects sales windows that close before they open", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      salesOpensAtLocal: "2026-11-02T10:00",
      salesClosesAtLocal: "2026-11-01T10:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a window with only one side set", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      salesOpensAtLocal: "2026-11-02T10:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed local datetimes", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      admissionOpensAtLocal: "02/11/2026 10:00",
      admissionClosesAtLocal: "03/11/2026 10:00",
    });
    expect(result.success).toBe(false);
  });

  it("defaults status to DRAFT and policy to FULL_PAYMENT", () => {
    const parsed = createEventSchema.parse(validEvent);
    expect(parsed.status).toBe("DRAFT");
    expect(parsed.admissionPolicy).toBe("FULL_PAYMENT");
  });

  it("allows partial updates (only provided fields are required)", () => {
    expect(updateEventSchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect(updateEventSchema.safeParse({}).success).toBe(true);
  });

  it("rejects equal start and end times on partial updates", () => {
    const result = updateEventSchema.safeParse({ startTime: "22:00", endTime: "22:00" });
    expect(result.success).toBe(false);
  });
});

describe("ticket type validation (PRD 5.4)", () => {
  const valid = { name: "Regular", priceUgx: 25_000 };

  it("accepts a valid category", () => {
    expect(createTicketTypeSchema.safeParse(valid).success).toBe(true);
  });

  it("allows free tickets (price 0) but rejects negative prices", () => {
    expect(createTicketTypeSchema.safeParse({ ...valid, priceUgx: 0 }).success).toBe(true);
    expect(createTicketTypeSchema.safeParse({ ...valid, priceUgx: -1 }).success).toBe(false);
  });

  it("rejects fractional or zero quantities", () => {
    expect(
      createTicketTypeSchema.safeParse({ ...valid, allocationLimit: 0 }).success,
    ).toBe(false);
    expect(
      createTicketTypeSchema.safeParse({ ...valid, allocationLimit: 10.5 }).success,
    ).toBe(false);
  });

  it("rejects a sales window with only one side", () => {
    const result = createTicketTypeSchema.safeParse({
      ...valid,
      salesOpensAtLocal: "2026-11-02T10:00",
    });
    expect(result.success).toBe(false);
  });
});
