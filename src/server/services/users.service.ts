import type { Role, User } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import type { AuthContext } from "@/lib/auth/session";
import { revokeUserSessions } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import type { CreateUserInput, UpdateUserInput } from "@/lib/validation/users";
import { conflict, notFound, requirePermission, validationError } from "./errors";

export interface UserDto {
  id: string;
  displayName: string;
  username: string;
  email: string | null;
  role: Role;
  active: boolean;
  contactPhone: string | null;
  createdAt: string;
}

/** Never expose password hashes or session material through user APIs. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    email: user.email,
    role: user.role,
    active: user.active,
    contactPhone: user.contactPhone,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function listUsers(ctx: AuthContext): Promise<UserDto[]> {
  requirePermission(ctx.role, "user:read");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map(toUserDto);
}

export async function createUser(
  ctx: AuthContext,
  input: CreateUserInput,
): Promise<UserDto> {
  requirePermission(ctx.role, "user:manage");

  const usernameTaken = await prisma.user.findUnique({
    where: { username: input.username },
    select: { id: true },
  });
  if (usernameTaken) {
    throw conflict("That username is already taken.");
  }
  if (input.email) {
    const emailTaken = await prisma.user.findFirst({
      where: { email: input.email },
      select: { id: true },
    });
    if (emailTaken) {
      throw conflict("That email address is already in use.");
    }
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      displayName: input.displayName,
      username: input.username,
      email: input.email ?? null,
      role: input.role,
      contactPhone: input.contactPhone ?? null,
      passwordHash,
    },
  });

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "user.create",
    targetType: "user",
    targetId: user.id,
    summary: { username: user.username, role: user.role },
  });
  return toUserDto(user);
}

export async function updateUser(
  ctx: AuthContext,
  userId: string,
  input: UpdateUserInput,
): Promise<UserDto> {
  requirePermission(ctx.role, "user:manage");

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw notFound("User not found.");

  // Prevent an admin from demoting themselves out of administrative access.
  if (input.role !== undefined && input.role !== existing.role && userId === ctx.userId) {
    throw validationError("You cannot change your own role.", [
      { path: "role", message: "Change another administrator's role instead." },
    ]);
  }

  if (input.email !== undefined && input.email !== existing.email && input.email) {
    const emailTaken = await prisma.user.findFirst({
      where: { email: input.email, id: { not: userId } },
      select: { id: true },
    });
    if (emailTaken) throw conflict("That email address is already in use.");
  }

  const roleChanged = input.role !== undefined && input.role !== existing.role;
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
    },
  });

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: roleChanged ? "user.role.change" : "user.update",
    targetType: "user",
    targetId: user.id,
    summary: {
      username: user.username,
      ...(roleChanged ? { from: existing.role, to: user.role } : {}),
      active: user.active,
    },
  });
  return toUserDto(user);
}

/**
 * Deactivation (never deletion) removes access immediately: all sessions are
 * revoked and `active=false` is rechecked on every request.
 */
export async function deactivateUser(
  ctx: AuthContext,
  userId: string,
): Promise<UserDto> {
  requirePermission(ctx.role, "user:manage");

  if (userId === ctx.userId) {
    throw validationError("You cannot deactivate your own account.");
  }
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw notFound("User not found.");
  if (!existing.active) return toUserDto(existing); // idempotent

  const user = await prisma.user.update({
    where: { id: userId },
    data: { active: false },
  });
  await revokeUserSessions(user.id);

  await recordAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "user.deactivate",
    targetType: "user",
    targetId: user.id,
    summary: { username: user.username, role: user.role },
  });
  return toUserDto(user);
}
