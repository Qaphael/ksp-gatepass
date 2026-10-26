import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getTokenEncryptionKey } from "@/lib/config";

/**
 * At-rest protection for QR tokens (AES-256-GCM).
 *
 * Business rules collide here: rule 6 says only the hash is stored, rule 8
 * says a reprint must reproduce the identical QR token. Compromise agreed with
 * the project owner: verification uses only `tokenHash`; the raw token is kept
 * additionally in `tokenEnc`, encrypted under TOKEN_ENCRYPTION_KEY, and is
 * decrypted exclusively inside the print path — never in APIs, exports, logs
 * or audit records.
 *
 * Format: `v1.<iv>.<ciphertext>.<authTag>` (all base64url). The IV is random
 * per encryption, so the same token never yields the same ciphertext.
 */

const VERSION = "v1";

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptToken(stored: string): string {
  const [version, ivPart, ctPart, tagPart] = stored.split(".");
  if (version !== VERSION || !ivPart || !ctPart || !tagPart) {
    throw new Error("Stored QR token is not in a recognised format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getTokenEncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctPart, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
