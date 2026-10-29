import { beforeAll, describe, expect, it } from "vitest";
import { TestClient, loginAs, unique } from "../helpers/client";
import { prisma } from "../helpers/db";

/**
 * Event lifecycle (PRD 5.3 / 7.2): status and open flags are separate,
 * transitions are validated, and every action is idempotent.
 */

let admin: TestClient;

const payload = (overrides: Record<string, unknown> = {}) => ({
  name: unique("Gala Night"),
  venue: "KSP Hotel Gulu",
  eventDate: "2026-12-05",
  startTime: "18:00",
  endTime: "23:00",
  capacity: 60,
  ...overrides,
});

beforeAll(async () => {
  admin = await loginAs("admin");
});

describe("event creation", () => {
  it("creates a draft event with safe defaults", async () => {
    const result = await admin.post("/api/v1/events", payload());
    expect(result.status).toBe(201);

    const event = result.body.event;
    expect(event.status).toBe("DRAFT");
    expect(event.salesOpen).toBe(false);
    expect(event.admissionOpen).toBe(false);
    expect(event.admissionPolicy).toBe("FULL_PAYMENT");
    expect(event.timezone).toBe("Africa/Kampala");
    expect(event.allocatedCapacity).toBe(0);
    expect(event.ticketTypeCount).toBe(0);
    expect(Number.isInteger(event.capacity)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "event.create", targetId: event.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toMatch(/password|token/i);
  });

  it("rejects invalid input with 422 and field-level details", async () => {
    const equalStartAndEnd = await admin.post(
      "/api/v1/events",
      payload({ endTime: "18:00" }),
    );
    expect(equalStartAndEnd.status).toBe(422);
    expect(equalStartAndEnd.body.error.code).toBe("VALIDATION_ERROR");
    expect(
      equalStartAndEnd.body.error.details.some(
        (detail: { path: string }) => detail.path === "endTime",
      ),
    ).toBe(true);

    const zeroCapacity = await admin.post(
      "/api/v1/events",
      payload({ capacity: 0 }),
    );
    expect(zeroCapacity.status).toBe(422);

    const impossibleDate = await admin.post(
      "/api/v1/events",
      payload({ eventDate: "2026-02-31" }),
    );
    expect(impossibleDate.status).toBe(422);

    const oneSidedWindow = await admin.post(
      "/api/v1/events",
      payload({ salesOpensAtLocal: "2026-11-01T10:00" }),
    );
    expect(oneSidedWindow.status).toBe(422);

    const malformedJson = await admin.json("/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(malformedJson.status).toBe(422);
  });

  it("answers 404 for an unknown event", async () => {
    const result = await admin.get(
      "/api/v1/events/00000000-0000-0000-0000-000000000000",
    );
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });
});

describe("event transitions", () => {
  it("refuses to open a draft", async () => {
    const created = await admin.post("/api/v1/events", payload());
    expect(created.status).toBe(201);
    const result = await admin.post(
      `/api/v1/events/${created.body.event.id}/open-sales`,
    );
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CONFLICT");
    expect(result.body.error.message).toMatch(/publish/i);
  });

  it("runs the full lifecycle with idempotent, audited steps", async () => {
    const created = await admin.post(
      "/api/v1/events",
      payload({ status: "SCHEDULED" }),
    );
    expect(created.status).toBe(201);
    const id = created.body.event.id;

    // Sales: open → open again (no-op) → close → close again (no-op).
    const open = await admin.post(`/api/v1/events/${id}/open-sales`);
    expect(open.status).toBe(200);
    expect(open.body.event.salesOpen).toBe(true);

    const openAgain = await admin.post(`/api/v1/events/${id}/open-sales`);
    expect(openAgain.status).toBe(200);
    expect(openAgain.body.event.salesOpen).toBe(true);

    const close = await admin.post(`/api/v1/events/${id}/close-sales`);
    expect(close.status).toBe(200);
    expect(close.body.event.salesOpen).toBe(false);

    const closeAgain = await admin.post(`/api/v1/events/${id}/close-sales`);
    expect(closeAgain.status).toBe(200);
    expect(closeAgain.body.event.salesOpen).toBe(false);

    // Exactly one audit row: repeats did not re-run the transition.
    const openAudits = await prisma.auditLog.count({
      where: { action: "event.sales.open", targetId: id },
    });
    expect(openAudits).toBe(1);

    // Admission window.
    const admissionOpen = await admin.post(`/api/v1/events/${id}/open-admission`);
    expect(admissionOpen.status).toBe(200);
    expect(admissionOpen.body.event.admissionOpen).toBe(true);
    const admissionClose = await admin.post(`/api/v1/events/${id}/close-admission`);
    expect(admissionClose.status).toBe(200);
    expect(admissionClose.body.event.admissionOpen).toBe(false);

    // Rename (audit records which fields changed).
    const renamed = await admin.patch(`/api/v1/events/${id}`, {
      name: "Renamed Gala Night",
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.event.name).toBe("Renamed Gala Night");
    const updateAudit = await prisma.auditLog.findFirst({
      where: { action: "event.update", targetId: id },
    });
    expect(updateAudit).not.toBeNull();

    // Complete: closes both flags, is idempotent, and makes the event read-only.
    const complete = await admin.post(`/api/v1/events/${id}/complete`);
    expect(complete.status).toBe(200);
    expect(complete.body.event.status).toBe("COMPLETED");
    expect(complete.body.event.salesOpen).toBe(false);
    expect(complete.body.event.admissionOpen).toBe(false);

    const completeAgain = await admin.post(`/api/v1/events/${id}/complete`);
    expect(completeAgain.status).toBe(200);
    expect(completeAgain.body.event.status).toBe("COMPLETED");

    const editAfterComplete = await admin.patch(`/api/v1/events/${id}`, {
      name: "Too Late",
    });
    expect(editAfterComplete.status).toBe(409);

    const reopenAfterComplete = await admin.post(
      `/api/v1/events/${id}/open-sales`,
    );
    expect(reopenAfterComplete.status).toBe(409);

    // Archive: idempotent, read-only afterwards.
    const archive = await admin.post(`/api/v1/events/${id}/archive`);
    expect(archive.status).toBe(200);
    expect(archive.body.event.status).toBe("ARCHIVED");

    const archiveAgain = await admin.post(`/api/v1/events/${id}/archive`);
    expect(archiveAgain.status).toBe(200);
    expect(archiveAgain.body.event.status).toBe("ARCHIVED");

    const completeArchived = await admin.post(`/api/v1/events/${id}/complete`);
    expect(completeArchived.status).toBe(409);

    const reopenArchived = await admin.post(
      `/api/v1/events/${id}/open-admission`,
    );
    expect(reopenArchived.status).toBe(409);

    const editArchived = await admin.patch(`/api/v1/events/${id}`, {
      venue: "Elsewhere",
    });
    expect(editArchived.status).toBe(409);
  });

  it("refuses to open a sales window that has not started or already closed", async () => {
    const future = await admin.post(
      "/api/v1/events",
      payload({
        status: "SCHEDULED",
        salesOpensAtLocal: "2030-01-01T00:00",
        salesClosesAtLocal: "2030-01-02T00:00",
      }),
    );
    expect(future.status).toBe(201);
    const futureOpen = await admin.post(
      `/api/v1/events/${future.body.event.id}/open-sales`,
    );
    expect(futureOpen.status).toBe(409);
    expect(futureOpen.body.error.message).toMatch(/not opened yet/i);
    expect(futureOpen.body.event).toBeUndefined();

    const past = await admin.post(
      "/api/v1/events",
      payload({
        status: "SCHEDULED",
        salesOpensAtLocal: "2020-01-01T00:00",
        salesClosesAtLocal: "2020-01-02T00:00",
      }),
    );
    expect(past.status).toBe(201);
    const pastOpen = await admin.post(
      `/api/v1/events/${past.body.event.id}/open-sales`,
    );
    expect(pastOpen.status).toBe(409);
    expect(pastOpen.body.error.message).toMatch(/already closed/i);
  });

  it("stores windows as UTC instants and reports them in event local time", async () => {
    const created = await admin.post(
      "/api/v1/events",
      payload({
        salesOpensAtLocal: "2026-11-15T10:00",
        salesClosesAtLocal: "2026-11-20T18:00",
      }),
    );
    expect(created.status).toBe(201);
    // Round-trips back to the entered Kampala wall time.
    expect(created.body.event.salesOpensAtLocal).toBe("2026-11-15T10:00");
    expect(created.body.event.salesClosesAtLocal).toBe("2026-11-20T18:00");
  });
});
