import "dotenv/config";
import { prisma } from "@/lib/db/client";

async function main() {
  const users = await prisma.user.findMany({
    select: { username: true, role: true, active: true },
    orderBy: { role: "asc" },
  });
  console.log("All users:", JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});