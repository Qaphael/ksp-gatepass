import { getLoginRateLimit } from "@/lib/config";
import { prisma } from "@/lib/db/client";

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds until the lock expires (only when blocked). */
  retryAfterMs?: number;
}

/** Keys counted for one login attempt: per account and per IP (PRD 11.1). */
export function loginRateKeys(identifier: string, ip: string | null): string[] {
  const keys = [`acct:${identifier.toLowerCase()}`];
  if (ip) keys.push(`ip:${ip}`);
  return keys;
}

/**
 * Returns allowed=false with a retry hint when any key has reached the failure
 * limit inside the window. Pure timing logic lives here so tests can drive it
 * with an injected `now`.
 */
export async function checkLoginAllowed(
  keys: string[],
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  const { max, windowMs, lockoutMs } = getLoginRateLimit();
  let shortestRetry: number | undefined;

  for (const key of keys) {
    const attempts = await prisma.loginAttempt.findMany({
      where: { key, createdAt: { gte: new Date(now - windowMs) } },
      orderBy: { createdAt: "desc" },
      take: max,
    });
    if (attempts.length >= max) {
      const trigger = attempts[attempts.length - 1];
      const retryAfterMs = trigger.createdAt.getTime() + lockoutMs - now;
      if (retryAfterMs > 0) {
        shortestRetry =
          shortestRetry === undefined
            ? retryAfterMs
            : Math.min(shortestRetry, retryAfterMs);
      }
    }
  }

  return shortestRetry === undefined
    ? { allowed: true }
    : { allowed: false, retryAfterMs: shortestRetry };
}

export async function recordFailedLogin(keys: string[]): Promise<void> {
  await prisma.loginAttempt.createMany({
    data: keys.map((key) => ({ key })),
  });
}

/** Called after a successful authentication. */
export async function clearLoginFailures(keys: string[]): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { key: { in: keys } } });
}
