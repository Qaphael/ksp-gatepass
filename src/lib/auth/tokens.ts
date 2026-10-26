import { createHash, randomBytes } from "node:crypto";

/**
 * Session tokens are opaque 256-bit random values. Only their SHA-256 hash is
 * stored in the database; the raw token exists solely in the client cookie.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
