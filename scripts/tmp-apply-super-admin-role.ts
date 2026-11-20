import "dotenv/config";
import { hashPassword } from "../src/lib/auth/password";
import { prisma } from "../src/lib/db/client";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  // Step 1: Apply the super_admin_role migration SQL directly.
  // Adds the SUPER_ADMIN enum value. The UPDATE is a no-op if qaphael doesn't exist yet.
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';`,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "username" = 'qaphael' AND "role" = 'ADMIN';`,
  );

  // Step 2: Create @qaphael as an active ADMIN if it doesn't exist.
  const existing = await prisma.user.findUnique({
    where: { username: "qaphael" },
  });
  if (existing) {
    console.log(
      `qaphael already exists (role=${existing.role}, active=${existing.active}).`,
    );
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await hashPassword("change-me-on-first-login-Admin123");
  await prisma.user.create({
    data: {
      displayName: "Super Administrator",
      username: "qaphael",
      role: "ADMIN",
      active: true,
      passwordHash,
    },
  });
  console.log("Created qaphael as active ADMIN.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
