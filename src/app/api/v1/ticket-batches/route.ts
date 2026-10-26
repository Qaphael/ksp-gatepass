import { z } from "zod";
import { apiHandler, jsonOk, readJson, ServiceError, ERROR_CODES } from "@/lib/api";
import { generateBatchSchema } from "@/lib/validation/tickets";
import { generateBatch, listBatches } from "@/server/services/ticket-batches.service";

const listQuerySchema = z.object({ eventId: z.string().trim().min(1) });

const IDEMPOTENCY_KEY_RE = /^[\x21-\x7E]{1,128}$/;

export const GET = apiHandler(async (ctx, req) => {
  const { eventId } = listQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  return jsonOk({ batches: await listBatches(ctx, eventId) });
});

export const POST = apiHandler(async (ctx, req) => {
  const input = generateBatchSchema.parse(await readJson(req));

  const rawKey = req.headers.get("idempotency-key")?.trim();
  let idempotencyKey: string | null = null;
  if (rawKey) {
    if (!IDEMPOTENCY_KEY_RE.test(rawKey)) {
      throw new ServiceError(
        422,
        ERROR_CODES.VALIDATION_ERROR,
        "Idempotency-Key must be 1-128 printable characters.",
      );
    }
    idempotencyKey = rawKey;
  }

  const { batch, created } = await generateBatch(ctx, input, idempotencyKey);
  return jsonOk({ batch, created }, created ? 201 : 200);
});
