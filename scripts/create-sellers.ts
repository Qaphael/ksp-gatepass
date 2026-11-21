import "dotenv/config";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/client";

async function main() {
  const sellers = [
    { username: "alice", displayName: "Alice M.", password: "SellerTest!Pass1234" },
    { username: "bob", displayName: "Bob K.", password: "SellerTest!Pass1234" },
    { username: "charlie", displayName: "Charlie T.", password: "SellerTest!Pass1234" },
  ];

  for (const s of sellers) {
    const existing = await prisma.user.findUnique({ where: { username: s.username } });
    if (existing) {
      console.log(`Seller ${s.username} already exists`);
      continue;
    }
    const passwordHash = await hashPassword(s.password);
    const created = await prisma.user.create({
      data: { username: s.username, displayName: s.displayName, passwordHash, role: "SELLER" },
    });
    console.log(`Created seller: ${created.username} (id: ${created.id})`);
  }

  const activeSellers = await prisma.user.findMany({ where: { role: "SELLER", active: true }, select: { username: true } });
  console.log("Active sellers:", activeSellers.map((s) => s.username).join(", "));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});