import { defineConfig, devices } from "@playwright/test";

// `webServer` (auto-starting the app against a local Supabase stack) is
// deliberately not configured yet — that wiring belongs to a later stage,
// once the local Supabase stack exists. For now this only runs self-
// contained tests (e.g. test/e2e/smoke.spec.ts) that prove the Playwright
// browser infrastructure itself works.
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.TEST_APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
