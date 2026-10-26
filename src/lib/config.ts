// Centralised environment access with safe defaults. Values are read at call
// time so tests can override them. Every variable used here is documented in
// .env.example.

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getSessionTtlMs(): number {
  return intFromEnv("SESSION_TTL_HOURS", 72) * 60 * 60 * 1000;
}

export function isCookieSecure(): boolean {
  const raw = process.env.COOKIE_SECURE;
  if (raw === undefined || raw === "") return process.env.NODE_ENV === "production";
  return raw === "true";
}

export interface LoginRateLimitConfig {
  /** Failed attempts allowed per key inside the window. */
  max: number;
  /** Length of the counting window in milliseconds. */
  windowMs: number;
  /** How long the key stays locked after the limit is exceeded. */
  lockoutMs: number;
}

export function getLoginRateLimit(): LoginRateLimitConfig {
  return {
    max: intFromEnv("LOGIN_RATE_LIMIT_MAX", 5),
    windowMs: intFromEnv("LOGIN_RATE_LIMIT_WINDOW_MINUTES", 15) * 60 * 1000,
    lockoutMs: intFromEnv("LOGIN_LOCKOUT_MINUTES", 15) * 60 * 1000,
  };
}

/**
 * 32-byte key for AES-256-GCM encryption of QR tokens at rest (business rule 8
 * vs rule 6 compromise: hash for lookups, encrypted copy for reprinting).
 *
 * There is NO fallback: a missing or malformed key is a configuration error
 * and must fail loudly rather than silently encrypting with a weak default.
 * Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
 */
export function getTokenEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
    );
  }
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64url (43 characters).",
    );
  }
  return key;
}
