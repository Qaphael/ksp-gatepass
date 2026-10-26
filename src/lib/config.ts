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
