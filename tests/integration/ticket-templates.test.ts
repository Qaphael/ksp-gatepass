import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";
import { placeholderTicketTemplateConfig } from "@/lib/validation/ticket-templates";

let admin: TestClient;
let seller: TestClient;
let verifier: TestClient;
let supervisor: TestClient;
let eventId: string;

async function sampleArtwork(description = "private-template-metadata") {
  return sharp({ create: { width: 2160, height: 650, channels: 3, background: "#d8c49a" } })
    .withExif({ IFD0: { ImageDescription: description } }).png().toBuffer();
}

function uploadForm(data: Buffer, config = placeholderTicketTemplateConfig(), name = unique("Ticket template")) {
  const form = new FormData();
  form.set("name", name);
  form.set("config", JSON.stringify(config));
  form.set("file", new Blob([Uint8Array.from(data)], { type: "image/png" }), "artwork.png");
  return form;
}

async function createTemplate(data?: Buffer, client = admin, key = unique("create"), name = unique("Ticket template")) {
  return client.json(`/api/v1/events/${eventId}/ticket-templates`, {
    method: "POST", headers: { "idempotency-key": key }, body: uploadForm(data ?? await sampleArtwork(), placeholderTicketTemplateConfig(), name),
  });
}

async function patchTemplate(id: string, body: unknown, key = unique("patch"), client = admin) {
  return client.json(`/api/v1/ticket-templates/${id}`, {
    method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  [admin, seller, verifier, supervisor] = await Promise.all([
    loginAs("admin"), loginAs("seller"), loginAs("verifier"), loginAs("supervisor"),
  ]);
  const created = await admin.post("/api/v1/events", {
    name: unique("Template event"), venue: "KSP Hotel Gulu", eventDate: "2026-12-12",
    startTime: "18:00", endTime: "23:00", capacity: 40,
  });
  expect(created.status).toBe(201);
  eventId = created.body.event.id as string;
});

describe("ticket template model and artwork API", () => {
  it("accepts RGB PNG artwork, strips metadata, serves only to authenticated admins, and audits upload", async () => {
    const result = await createTemplate();
    expect(result.status).toBe(201);
    expect(result.body.template.status).toBe("DRAFT");
    expect(result.body.template.version).toBe(1);
    expect(result.body.template.zonesArePlaceholder).toBe(false);
    expect(JSON.stringify(result.body)).not.toContain("assetStorageKey");

    const url = result.body.template.artworkUrl as string;
    expect((await fetch(new URL(url, BASE_URL))).status).toBe(401);
    expect((await seller.request(url)).status).toBe(403);
    const served = await admin.request(url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toBe("private, no-store");
    const metadata = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    expect(metadata.width).toBe(2160);
    expect(metadata.height).toBe(650);
    expect(metadata.space).toBe("srgb");
    expect(metadata.exif).toBeUndefined();

    const templateId = result.body.template.id as string;
    expect(await prisma.auditLog.findFirst({ where: { action: "ticket-template.artwork.upload", targetId: templateId } })).not.toBeNull();
  });

  it("requires admin permission on list and create for every non-admin role", async () => {
    const created = await createTemplate();
    const id = created.body.template.id as string;
    for (const client of [seller, verifier, supervisor]) {
      expect((await client.get(`/api/v1/events/${eventId}/ticket-templates`)).status).toBe(403);
      expect((await createTemplate(await sampleArtwork(), client)).status).toBe(403);
      expect((await patchTemplate(id, { name: "forbidden edit" }, unique("denied-patch"), client)).status).toBe(403);
      const activation = await client.request(`/api/v1/ticket-templates/${id}/activate`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": unique("denied-activation") },
        body: JSON.stringify({ ownerConfirmed: true, production: false }),
      });
      expect(activation.status).toBe(403);
      expect((await client.request(created.body.template.artworkUrl)).status).toBe(403);
    }
  });

  it("rejects SVG, incorrect signatures, oversized artwork, and incorrect aspect ratios", async () => {
    const svg = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");
    expect((await createTemplate(svg)).status).toBe(422);
    const wrongSignature = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
    expect((await createTemplate(wrongSignature)).status).toBe(422);

    const tooLarge = Buffer.alloc(40 * 1024 * 1024 + 1);
    const oversized = await createTemplate(tooLarge);
    expect(oversized.status).toBe(422);
    expect(oversized.body.error.message).toContain("40 MB");

    const tooManyPixels = await sharp({ create: { width: 8001, height: 5000, channels: 3, background: "#000000" } }).png().toBuffer();
    const pixelRejected = await createTemplate(tooManyPixels);
    expect(pixelRejected.status).toBe(422);
    expect(pixelRejected.body.error.message).toContain("40 megapixels");

    const wrongRatio = await sharp({ create: { width: 320, height: 180, channels: 3, background: "#000000" } }).png().toBuffer();
    const rejected = await createTemplate(wrongRatio);
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.message).toContain("2551 × 768 px");
  }, 60_000);

  it("makes create and patch retries idempotent and never mutates an older version", async () => {
    const key = unique("idempotent-create");
    const stableName = unique("idempotent-template");
    const first = await createTemplate(await sampleArtwork(), admin, key, stableName);
    const retry = await createTemplate(await sampleArtwork(), admin, key, stableName);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.template.id).toBe(first.body.template.id);

    const firstId = first.body.template.id as string;
    const patchKey = unique("idempotent-patch");
    const changed = await patchTemplate(firstId, { name: first.body.template.name }, patchKey);
    const changedRetry = await patchTemplate(firstId, { name: first.body.template.name }, patchKey);
    expect(changed.status, JSON.stringify(changed.body)).toBe(201);
    expect(changedRetry.status).toBe(200);
    expect(changedRetry.body.template.id).toBe(changed.body.template.id);
    expect(changed.body.template.version).toBe(2);
    expect(changed.body.template.id).not.toBe(firstId);
    const old = await prisma.ticketTemplate.findUniqueOrThrow({ where: { id: firstId } });
    expect(old.version).toBe(1);
    expect(old.status).toBe("DRAFT");
    expect((await patchTemplate(firstId, { name: "too late" })).status).toBe(409);
    expect(await prisma.auditLog.findFirst({ where: { action: "ticket-template.version.create", targetId: changed.body.template.id } })).not.toBeNull();
  });

  it("requires measured zones, calibration, and owner confirmation before production activation", async () => {
    const placeholder = await createTemplate(await sampleArtwork(), admin);
    const placeholderId = placeholder.body.template.id as string;
    await prisma.ticketTemplate.update({ where: { id: placeholderId }, data: { zonesArePlaceholder: true } });
    const failedPlaceholder = await admin.request(`/api/v1/ticket-templates/${placeholderId}/activate`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": unique("activate-placeholder") },
      body: JSON.stringify({ ownerConfirmed: true, production: true }),
    });
    const failedPlaceholderBody = await failedPlaceholder.json() as { error: { message: string } };
    expect(failedPlaceholder.status).toBe(409);
    expect(failedPlaceholderBody.error.message).toContain("Measured");

    const template = await createTemplate(await sampleArtwork(), admin);
    const id = template.body.template.id as string;
    await prisma.ticketTemplate.update({ where: { id }, data: { calibrationPrintedAt: new Date() } });
    const request = async (ownerConfirmed: boolean) => admin.request(`/api/v1/ticket-templates/${id}/activate`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": unique("activate") },
      body: JSON.stringify({ ownerConfirmed, production: true }),
    });
    expect((await request(false)).status).toBe(422);
    const active = await request(true);
    expect(active.status).toBe(200);
    const body = await active.json() as { template: { status: string; confirmedById: string; confirmedAt: string } };
    expect(body.template.status).toBe("ACTIVE");
    expect(body.template.confirmedById).toBeTruthy();
    expect(body.template.confirmedAt).toBeTruthy();
  });
});
