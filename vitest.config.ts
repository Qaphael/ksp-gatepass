import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/ksp_gatepass_test";
const TEST_BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100";

// Integration tests share one server and one database (rate-limit fixtures in
// particular), so test files run sequentially.
process.env.DATABASE_URL = TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/_safe-stack.ts"],
    // Prisma's error stack handling collides with Vite's module runner when
    // the package is externalized (source lookup returns undefined and crashes
    // Error.prepareStackTrace). Processing it through the runner fixes that.
    server: {
      deps: {
        inline: [/@prisma\//],
      },
    },
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      TEST_BASE_URL,
      // Keep integration fixtures deterministic (see tests/global-setup.ts).
      LOGIN_RATE_LIMIT_MAX: "3",
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: "10",
      LOGIN_LOCKOUT_MINUTES: "10",
    },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 600_000,
  },
});
