/**
 * Starts a local embedded PostgreSQL cluster for development.
 *
 * Usage: `pnpm db:up`
 *
 * The cluster persists in `.data/postgres` (gitignored) so dev data survives
 * restarts. Stop the process with Ctrl+C. This is a development convenience
 * only — deployments use the PostgreSQL service in docker-compose.yml.
 */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseDir = path.join(root, ".data", "postgres");
const port = Number(process.env.EMBEDDED_PG_PORT ?? 5434);
const database = process.env.EMBEDDED_PG_DATABASE ?? "ksp_gatepass";

async function isPortServing(port: number): Promise<boolean> {
  const net = await import("node:net");
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main(): Promise<void> {
  if (await isPortServing(port)) {
    process.stdout.write(
      `Embedded PostgreSQL already running on port ${port}.\n` +
        `DATABASE_URL="postgresql://postgres:postgres@localhost:${port}/${database}"\n`,
    );
    return;
  }

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    // Keep dev output quiet; errors still surface through onError.
    onLog: () => {},
  });

  const alreadyInitialised = fs.existsSync(path.join(databaseDir, "PG_VERSION"));
  if (!alreadyInitialised) {
    await pg.initialise();
  }
  await pg.start();

  try {
    await pg.createDatabase(database);
  } catch {
    // Database already exists from a previous run.
  }

  const url = `postgresql://postgres:postgres@localhost:${port}/${database}`;
  process.stdout.write(`\nEmbedded PostgreSQL running.\nDATABASE_URL="${url}"\n\nPress Ctrl+C to stop.\n`);

  const shutdown = async (): Promise<void> => {
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("Failed to start embedded PostgreSQL:", error);
  process.exit(1);
});
