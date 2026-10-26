import { randomBytes } from "node:crypto";
import { recordAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  revokeUserSessions,
  type AuthContext,
} from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  checkLoginAllowed,
  clearLoginFailures,
  loginRateKeys,
  recordFailedLogin,
} from "@/lib/rate-limit/login";
import type { ChangePasswordInput, LoginInput } from "@/lib/validation/auth";
import { validationError } from "./errors";

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid_credentials" | "rate_limited"; retryAfterMs?: number };

/**
 * A throwaway hash so unknown-username logins take as long as a real
 * password check (the response never reveals whether an account exists).
 */
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHashPromise;
}

export async function login(input: LoginInput, ip: string | null): Promise<LoginResult> {
  const identifier = input.identifier.toLowerCase();
  const keys = loginRateKeys(identifier, ip);

  const decision = await checkLoginAllowed(keys);
  if (!decision.allowed) {
    await recordAudit({
      action: "auth.login.failure",
      outcome: "FAILURE",
      summary: { identifier, reason: "rate_limited" },
    });
    return { ok: false, reason: "rate_limited", retryAfterMs: decision.retryAfterMs };
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
  });

  const passwordOk = user
    ? await verifyPassword(user.passwordHash, input.password)
    : await verifyPassword(await getDummyHash(), input.password);

  if (!user || !passwordOk || !user.active) {
    await recordFailedLogin(keys);
    await recordAudit({
      action: "auth.login.failure",
      outcome: "FAILURE",
      summary: {
        identifier,
        reason: !user || !passwordOk ? "bad_credentials" : "inactive_account",
      },
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  await clearLoginFailures(keys);
  const { expiresAt } = await createSession(user.id);
  await recordAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "auth.login.success",
    targetType: "user",
    targetId: user.id,
    summary: { expiresAt: expiresAt.toISOString() },
  });
  return { ok: true };
}

export async function logout(ctx: AuthContext): Promise<void> {
  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "auth.logout",
    targetType: "user",
    targetId: ctx.userId,
  });
}

/**
 * Changes the signed-in user's password after verifying the current one.
 * All other sessions are revoked; the current session stays valid.
 */
export async function changePassword(
  ctx: AuthContext,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user || !user.active) {
    throw validationError("Account is not active.");
  }

  const currentOk = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!currentOk) {
    throw validationError("Current password is incorrect.", [
      { path: "currentPassword", message: "Current password is incorrect." },
    ]);
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  await revokeUserSessions(user.id, ctx.sessionId);
  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "auth.password.change",
    targetType: "user",
    targetId: user.id,
  });
}
