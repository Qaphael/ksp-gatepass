import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { apiHandler } from "@/lib/api";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/qr/token-vault";
import { forbidden, notFound } from "@/server/services/errors";

/**
 * Authenticated QR preview image (PRD 5.6). The raw token never reaches the
 * browser: only the rendered PNG does, and only to holders of
 * `inventory:read`. Verification still happens server-side at the gate.
 */
export const GET = apiHandler(async (ctx, _req, params) => {
  if (!can(ctx.role, "inventory:read")) throw forbidden();

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    select: { tokenEnc: true },
  });
  if (!ticket) throw notFound("Ticket not found.");

  const png = await QRCode.toBuffer(decryptToken(ticket.tokenEnc), {
    type: "png",
    margin: 1,
    width: 512,
    errorCorrectionLevel: "Q",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
