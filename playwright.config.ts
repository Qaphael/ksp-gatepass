import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/e2e",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
});
