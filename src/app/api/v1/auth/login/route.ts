import {
  ERROR_CODES,
  clientIp,
  jsonError,
  jsonOk,
  publicApiHandler,
  readJson,
} from "@/lib/api";
import { loginSchema } from "@/lib/validation/auth";
import { login } from "@/server/services/auth.service";

export const POST = publicApiHandler(async (req) => {
  const input = loginSchema.parse(await readJson(req));
  const result = await login(input, clientIp(req));

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      const retrySeconds = Math.max(
        1,
        Math.ceil((result.retryAfterMs ?? 0) / 1000),
      );
      const response = jsonError(
        429,
        ERROR_CODES.RATE_LIMITED,
        "Too many failed attempts. Please wait before trying again.",
      );
      response.headers.set("Retry-After", String(retrySeconds));
      return response;
    }
    // Generic message: never reveal whether the account exists (PRD 5.1).
    return jsonError(
      401,
      ERROR_CODES.UNAUTHENTICATED,
      "Invalid username or password.",
    );
  }

  return jsonOk({ ok: true });
});
