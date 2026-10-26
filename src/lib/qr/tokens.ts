import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque QR token generation (PRD 9.4 / AGENTS rule 6).
 *
 * The raw token is generated at ticket creation, embedded into the printed QR
 * code while rendering, and then discarded — only its SHA-256 hash is stored.
 * The token carries no personal data, no serial and no database ID.
 */

/** 32 random bytes → 43-character URL-safe string (256 bits of entropy). */
export function generateQrToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest of a raw token. Lookups hash the submitted value. */
export function hashQrToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
