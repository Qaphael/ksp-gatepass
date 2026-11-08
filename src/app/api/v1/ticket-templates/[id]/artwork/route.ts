import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { getTicketTemplateArtwork } from "@/server/services/ticket-templates.service";

export const GET = apiHandler(async (ctx, _req, params) => {
  const artwork = await getTicketTemplateArtwork(ctx, params.id);
  return new NextResponse(new Uint8Array(artwork.data), {
    status: 200,
    headers: {
      "Content-Type": artwork.format === "png" ? "image/png" : "image/jpeg",
      "Content-Length": String(artwork.data.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
});
