import "dotenv/config";
import { prisma } from "@/lib/db/client";

async function main() {
  const sellers = await prisma.user.findMany({
    where: { role: "SELLER" },
    select: { username: true, displayName: true, active: true, role: true },
  });
  console.log("All SELLER users:", JSON.stringify(sellers, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});