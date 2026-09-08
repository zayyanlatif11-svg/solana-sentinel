import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4317",
    extraHTTPHeaders: { origin: "http://127.0.0.1:4317" },
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm --filter @sat/web run dev",
    url: "http://127.0.0.1:4317",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      DEMO_MODE: "true",
      OPERATING_MODE: "PAPER",
      ALLOW_LIVE_TRADING: "false",
      PAPER_FAIL_PROBABILITY: "0",
      PAPER_PARTIAL_PROBABILITY: "0",
      SAT_BIND_HOST: "127.0.0.1",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
