/**
 * Vitest global setup:
 *  1. Starts embedded PostgreSQL if it is not already running.
 *  2. Creates the dedicated test database (never the dev database).
 *  3. Applies pending migrations to the test database.
 *  4. Builds the app and starts `next start` against the test database.
 *  5. Seeds one active user per role (test database only).
 *
 * Teardown stops the server it started (and PostgreSQL only if it started it).
 */
import "./_safe-stack";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPort = Number(process.env.EMBEDDED_PG_PORT ?? 5434);
const testDbName = process.env.TEST_DATABASE_NAME ?? "ksp_gatepass_test";
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:${dbPort}/${testDbName}`;
const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100";

const adminUrl = `postgresql://postgres:postgres@localhost:${dbPort}/postgres`;

let startedPostgres: { stop(): Promise<void> } | null = null;
let serverPid: number | null = null;

async function canConnect(url: string): Promise<boolean> {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    await client.end().catch(() => undefined);
    return false;
  }
}

async function ensurePostgres(): Promise<void> {
  if (await canConnect(adminUrl)) return;

  // embedded-postgres reads uid only to detect Unix root. Node can fail to
  // resolve the Windows account in restricted desktop sandboxes; Windows has
  // no Unix root user, so provide the non-root value the package needs.
  if (process.platform === "win32") {
    try {
      os.userInfo();
    } catch {
      os.userInfo = (() => ({
        uid: -1,
        gid: -1,
        username: process.env.USERNAME ?? "",
        homedir: process.env.USERPROFILE ?? "",
        shell: "",
      })) as typeof os.userInfo;
      syncBuiltinESMExports();
    }
  }
  const { default: EmbeddedPostgres } = await import("embedded-postgres");

  const dataDir = path.join(root, ".data", "postgres");
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: dbPort,
    persistent: true,
    onLog: () => {},
  });
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    await pg.initialise();
  }
  await pg.start();
  startedPostgres = pg;
}

async function ensureTestDatabase(): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      testDbName,
    ]);
    if ((existing.rowCount ?? 0) === 0) {
      await admin.query(`CREATE DATABASE "${testDbName}"`);
    }
  } finally {
    await admin.end();
  }
}

function migrateTestDatabase(): void {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    },
  );
}

function buildApp(): void {
  execFileSync("pnpm", ["build"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
}

function startServer(): void {
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3100"],
    {
      cwd: root,
      stdio: "ignore",
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: "production",
        COOKIE_SECURE: "false",
        LOGIN_RATE_LIMIT_MAX: process.env.LOGIN_RATE_LIMIT_MAX ?? "3",
        LOGIN_RATE_LIMIT_WINDOW_MINUTES:
          process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES ?? "10",
        LOGIN_LOCKOUT_MINUTES: process.env.LOGIN_LOCKOUT_MINUTES ?? "10",
      },
    },
  );
  serverPid = child.pid ?? null;
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/me`);
      if (response.status === 401 || response.status === 200) return;
    } catch {
      // Server not accepting connections yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Test server did not become ready at ${baseUrl}`);
}

async function seedTestUsers(): Promise<void> {
  process.env.DATABASE_URL = testDatabaseUrl;
  console.log(`[setup] seeding test users against ${testDbName}…`);
  try {
    const { hashPassword } = await import("../src/lib/auth/password");
    const { prisma } = await import("../src/lib/db/client");

    const users = [
      { username: "admin", displayName: "Test Admin", role: "ADMIN" as const, password: "AdminTest!Pass1234" },
      { username: "seller", displayName: "Test Seller", role: "SELLER" as const, password: "SellerTest!Pass1234" },
      { username: "verifier", displayName: "Test Verifier", role: "VERIFIER" as const, password: "VerifierTest!Pass1234" },
      { username: "supervisor", displayName: "Test Supervisor", role: "SUPERVISOR" as const, password: "SupervisorTest!Pass1234" },
    ];

    for (const user of users) {
      const passwordHash = await hashPassword(user.password);
      await prisma.user.upsert({
        where: { username: user.username },
        create: {
          displayName: user.displayName,
          username: user.username,
          role: user.role,
          passwordHash,
        },
        update: { passwordHash, active: true, displayName: user.displayName, role: user.role },
      });
    }
    await prisma.$disconnect();
  } catch (error) {
    // Prisma's own stack formatting crashes inside Vitest's module runner, so
    // log the message (safe) instead of the stack here.
    console.error(
      "[setup] seed failed:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
  console.log("[setup] test users seeded");
}

export default async function setup(): Promise<void> {
  console.log("[setup] ensuring postgres…");
  await ensurePostgres();
  console.log("[setup] ensuring test database…");
  await ensureTestDatabase();
  console.log("[setup] applying migrations…");
  migrateTestDatabase();
  console.log("[setup] building app…");
  buildApp();
  console.log("[setup] starting server…");
  startServer();
  await waitForServer();
  console.log("[setup] server ready");
  await seedTestUsers();
}

export async function teardown(): Promise<void> {
  if (serverPid !== null) {
    spawnSync("taskkill", ["/pid", String(serverPid), "/T", "/F"], {
      stdio: "ignore",
      shell: true,
    });
    serverPid = null;
  }
  if (startedPostgres) {
    await startedPostgres.stop();
    startedPostgres = null;
  }
}
