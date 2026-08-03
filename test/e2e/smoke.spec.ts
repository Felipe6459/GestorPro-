import { test, expect } from "@playwright/test";

// Proves the Playwright browser infrastructure itself starts and can
// render a page — deliberately self-contained (a data: URL, not the app),
// since no webServer/local Supabase stack is wired up yet (see
// playwright.config.ts). Real app E2E tests arrive in a later stage.
test("browser launches and renders a page", async ({ page }) => {
  await page.goto("data:text/html,<h1>infrastructure ok</h1>");
  await expect(page.locator("h1")).toHaveText("infrastructure ok");
});
