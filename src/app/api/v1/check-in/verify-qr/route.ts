import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { verifyQrSchema } from "@/lib/validation/check-in";
import { verifyQr } from "@/server/services/check-in.service";

export const POST = apiHandler(async (ctx, req) =>
  jsonOk(await verifyQr(ctx, verifyQrSchema.parse(await readJson(req)))),
);
