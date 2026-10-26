/**
 * Direct database access for assertions (session hashing, audit rows, raw
 * constraint checks). DATABASE_URL points at the test database — see
 * vitest.config.ts.
 */
import { prisma } from "@/lib/db/client";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/tokens";

export { prisma, generateSessionToken, hashSessionToken };

/** Inserts a session row directly (used for expiry tests). */
export async function insertSessionWithToken(
  userId: string,
  options: { expiresAt: Date; revokedAt?: Date | null },
): Promise<string> {
  const token = generateSessionToken();
  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt: options.expiresAt,
      revokedAt: options.revokedAt ?? null,
    },
  });
  return token;
}
