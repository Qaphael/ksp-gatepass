import { apiHandler, jsonOk, readJson } from "@/lib/api";
import { verifySerialSchema } from "@/lib/validation/check-in";
import { verifySerial } from "@/server/services/check-in.service";

export const POST = apiHandler(async (ctx, req) =>
  jsonOk(await verifySerial(ctx, verifySerialSchema.parse(await readJson(req)))),
);
