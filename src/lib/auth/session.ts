import "server-only";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/client";
import { isCookieSecure, getSessionTtlMs } from "@/lib/config";
import { prisma } from "@/lib/db/client";
import { generateSessionToken, hashSessionToken } from "./tokens";

export const SESSION_COOKIE_NAME = "ksp_session";

/** Avoid one UPDATE per request: only refresh lastSeenAt when stale. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export interface AuthContext {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  expiresAt: Date;
}

/**
 * Creates a server-side session. The raw token goes only into the HttpOnly
 * cookie; the database stores its SHA-256 hash.
 */
export async function createSession(userId: string): Promise<{ expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + getSessionTtlMs());
  await prisma.session.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { expiresAt };
}

/**
 * Resolves the current request's session. Returns null when the cookie is
 * missing, the session is expired/revoked, or the user was deactivated —
 * so a deactivated user loses access on their next server request.
 */
export async function getSessionContext(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user.active) return null;

  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    username: session.user.username,
    displayName: session.user.displayName,
    role: session.user.role,
    expiresAt: session.expiresAt,
  };
}

/** Revokes the current session server-side and clears the cookie. */
export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE_NAME);
}

/**
 * Revokes every session of a user, optionally keeping the current one.
 * Used after password changes and account deactivation.
 */
export async function revokeUserSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}
