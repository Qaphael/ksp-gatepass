import "dotenv/config";
import { prisma } from "../src/lib/db/client";

async function main(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name;`,
  );
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
