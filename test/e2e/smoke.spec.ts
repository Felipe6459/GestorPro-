import { test, expect } from "@playwright/test";

// Proves the Playwright browser infrastructure itself starts and can
// render a page — deliberately self-contained (a data: URL, not the app),
// independent of the webServer/PGlite stack the other test/e2e/*.spec.ts
// files depend on (see playwright.config.ts).
test("browser launches and renders a page", async ({ page }) => {
  await page.goto("data:text/html,<h1>infrastructure ok</h1>");
  await expect(page.locator("h1")).toHaveText("infrastructure ok");
});
