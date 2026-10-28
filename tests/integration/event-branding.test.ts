import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, loginAs, unique, type TestClient } from "../helpers/client";
import { prisma } from "../helpers/db";

let admin: TestClient;
let seller: TestClient;
let eventId: string;

async function smallJpeg(description = "private-image-metadata") {
  return sharp({ create: { width: 320, height: 180, channels: 3, background: "#c8a24a" } })
    .withExif({ IFD0: { ImageDescription: description } })
    .jpeg()
    .toBuffer();
}

function imageForm(data: Buffer, options: { kind?: string; altText?: string; filename?: string; mime?: string } = {}) {
  const form = new FormData();
  form.set("kind", options.kind ?? "POSTER");
  form.set("altText", options.altText ?? "KSP event poster");
  form.set("file", new Blob([Uint8Array.from(data)], { type: options.mime ?? "image/jpeg" }), options.filename ?? "source.jpg");
  return form;
}

async function upload(form: FormData, client = admin) {
  const response = await client.request(`/api/v1/events/${eventId}/branding`, { method: "PUT", body: form });
  const body = await response.json();
  return { response, body };
}

beforeAll(async () => {
  admin = await loginAs("admin");
  seller = await loginAs("seller");
  const created = await admin.post("/api/v1/events", {
    name: unique("Branding Event"),
    venue: "KSP Hotel Gulu",
    eventDate: "2026-12-12",
    startTime: "18:00",
    endTime: "23:00",
    capacity: 40,
  });
  expect(created.status).toBe(201);
  eventId = created.body.event.id;
});

describe("event branding", () => {
  it("rejects non-admin uploads, SVG, and files larger than 5 MB", async () => {
    const denied = await upload(imageForm(await smallJpeg()), seller);
    expect(denied.response.status).toBe(403);

    const svg = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");
    const rejectedSvg = await upload(imageForm(svg, { mime: "image/svg+xml", filename: "poster.svg" }));
    expect(rejectedSvg.response.status).toBe(422);

    const oversized = await upload(imageForm(Buffer.alloc(5 * 1024 * 1024 + 1)));
    expect(oversized.response.status).toBe(422);
    expect(oversized.body.error.message).toContain("5 MB");
  });

  it("uploads clean thumbnail and display variants and serves them publicly", async () => {
    const uploaded = await upload(imageForm(await smallJpeg("must-not-survive-reencode")));
    expect(uploaded.response.status).toBe(201);
    const asset = uploaded.body.asset as { id: string; displayUrl: string; thumbnailUrl: string; width: number; height: number; altText: string };
    expect(asset.width).toBe(320);
    expect(asset.height).toBe(180);
    expect(asset.altText).toBe("KSP event poster");

    for (const url of [asset.thumbnailUrl, asset.displayUrl]) {
      const served = await fetch(new URL(url, BASE_URL));
      expect(served.status).toBe(200);
      expect(served.headers.get("content-type")).toContain("image/webp");
      expect(served.headers.get("x-content-type-options")).toBe("nosniff");
      expect(served.headers.get("cache-control")).toContain("public");
      const metadata = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.exif).toBeUndefined();
    }

    const audit = await prisma.auditLog.findFirst({ where: { action: "event.branding.upload", targetId: asset.id } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.summary)).not.toContain("must-not-survive-reencode");
  });

  it("replaces and removes a poster with audit entries and a versioned public URL", async () => {
    const before = await prisma.eventBrandingAsset.findUniqueOrThrow({ where: { eventId_kind: { eventId, kind: "POSTER" } } });
    const priorUrl = `/api/v1/branding/${before.storageKey}?variant=display`;
    const replaced = await upload(imageForm(await smallJpeg(), { altText: "Updated event artwork" }));
    expect(replaced.response.status).toBe(201);
    expect(replaced.body.asset.displayUrl).not.toBe(priorUrl);
    expect((await fetch(new URL(priorUrl, BASE_URL))).status).toBe(404);

    const replacementId = replaced.body.asset.id as string;
    expect(await prisma.auditLog.findFirst({ where: { action: "event.branding.replace", targetId: replacementId } })).not.toBeNull();
    const removed = await admin.request(`/api/v1/events/${eventId}/branding?kind=POSTER`, { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect(await prisma.auditLog.findFirst({ where: { action: "event.branding.remove", targetId: replacementId } })).not.toBeNull();
    expect((await fetch(new URL(replaced.body.asset.displayUrl, BASE_URL))).status).toBe(404);
  });

  it("rejects unsupported dimensions and requires alt text", async () => {
    const badDimensions = await sharp({ create: { width: 20_001, height: 1, channels: 3, background: "#000000" } }).png().toBuffer();
    const rejected = await upload(imageForm(badDimensions, { mime: "image/png", filename: "too-wide.png" }));
    expect(rejected.response.status).toBe(422);

    const missingAlt = await upload(imageForm(await smallJpeg(), { altText: "   " }));
    expect(missingAlt.response.status).toBe(422);
  });
});
