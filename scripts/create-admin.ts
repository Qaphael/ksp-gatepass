import "dotenv/config";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/client";

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true } });
  if (existingAdmin) {
    console.log("Admin already exists:", existingAdmin.username);
  } else {
    const passwordHash = await hashPassword("AdminTest!Pass1234");
    const created = await prisma.user.create({
      data: { username: "admin", displayName: "Test Admin", passwordHash, role: "ADMIN" },
    });
    console.log("Created admin:", created.username);
  }

  const activeAdmin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, select: { username: true } });
  console.log("Active admins:", activeAdmin?.username ?? "none");
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});