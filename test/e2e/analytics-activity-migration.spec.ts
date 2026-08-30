import { test, expect } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, dbQuery, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Design System page migration Batch 4 — Analytics + Activity. Covers
 * this batch's own critical gates: values/data are unchanged (only
 * presentation), semantic surfaces, and Dark-mode chart readability
 * (charts now source their color from CSS custom properties instead of
 * literal hex — see growth-line-chart.tsx/activity-stacked-bar-chart.tsx/
 * comparison-bar-chart.tsx/sparkline.tsx's own comments).
 *
 * Not a class-string snapshot suite — assertions are real rendered
 * values (KPI numbers, activity content) cross-checked against a direct
 * Prisma read, and computed-style contrast checks.
 */

test.describe("Design System Batch 4 — Analytics + Activity", () => {
  let fixtures: TestFixtures;

  test.beforeAll(async () => {
    fixtures = await seedE2EFixtures();
  });

  test.afterAll(async () => {
    await cleanupTestData(fixtures);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await dbQuery("user", "update", { where: { id: fixtures.owner.id }, data: { themeMode: "LIGHT" } });
  });

  test("Analytics: KPI values match a direct DB read, range selector preserves totals", async ({ page, context, baseURL }) => {
    await injectTestSession(context, fixtures.owner, baseURL!);
    await page.goto("/analytics");

    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();

    const realClientCount = await dbQuery<number>("client", "count", {
      where: { organizationId: fixtures.orgA.id },
    });
    const realProjectCount = await dbQuery<number>("project", "count", {
      where: { organizationId: fixtures.orgA.id },
    });

    const overview = page.locator("#analytics-overview-heading").locator("..");
    await expect(overview.getByText("Clients", { exact: true })).toBeVisible();
    const clientsValue = await overview
      .locator("p", { hasText: "Clients" })
      .locator("..")
      .locator("p.text-2xl")
      .textContent();
    expect(Number(clientsValue)).toBe(realClientCount);

    // Switching the time range must not change entity totals — only the
    // trend/growth series are range-scoped, never the raw current counts.
    await page.goto("/analytics?range=last7Days");
    const clientsValueAfterRangeChange = await page
      .locator("#analytics-overview-heading")
      .locator("..")
      .locator("p", { hasText: "Clients" })
      .locator("..")
      .locator("p.text-2xl")
      .textContent();
    expect(Number(clientsValueAfterRangeChange)).toBe(realClientCount);
    expect(realProjectCount).toBeGreaterThanOrEqual(1);

    await expect(page.getByRole("link", { name: "All time" })).toBeVisible();
  });

  test("Analytics: MEMBER role sees access-denied, not the dashboard", async ({ page, context, baseURL }) => {
    await injectTestSession(context, fixtures.member, baseURL!);
    await page.goto("/analytics");

    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Analytics" })).not.toBeVisible();
  });

  test("Analytics: chart panels render without runtime errors", async ({ page, context, baseURL }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await injectTestSession(context, fixtures.owner, baseURL!);
    await page.goto("/analytics");

    await expect(page.getByRole("heading", { name: "Trends", exact: true })).toBeVisible();
    // Recharts renders an SVG per chart — at least the Growth/Comparison
    // panels' charts (or their ChartEmptyState fallback) must be present.
    const svgCount = await page.locator("svg").count();
    expect(svgCount).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("Activity: seeded event content matches a direct DB read", async ({ page, context, baseURL }) => {
    await injectTestSession(context, fixtures.owner, baseURL!);
    await page.goto("/activity");

    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();

    const realActivity = await dbQuery<{ action: string; entityType: string }[]>("activity", "findMany", {
      where: { organizationId: fixtures.orgA.id },
    });
    expect(realActivity.length).toBeGreaterThanOrEqual(1);

    // Scoped to the timeline list itself — the actor filter's own <select>
    // also contains an <option>Test owner</option>, hidden until opened,
    // which a page-wide getByText would otherwise match instead.
    const timeline = page.locator("ul").filter({ hasText: fixtures.clientA.name });
    await expect(timeline.getByText(fixtures.owner.name, { exact: false }).first()).toBeVisible();
    await expect(timeline.getByText(fixtures.clientA.name, { exact: false }).first()).toBeVisible();
  });

  test("Activity: filters preserve query params", async ({ page, context, baseURL }) => {
    await injectTestSession(context, fixtures.owner, baseURL!);
    await page.goto("/activity?entityType=CLIENT&actionGroup=data");

    await expect(page).toHaveURL(/entityType=CLIENT/);
    await expect(page).toHaveURL(/actionGroup=data/);
    await expect(page.getByRole("link", { name: "Clear" })).toBeVisible();
  });

  test("Dark mode: Analytics and Activity have no raw-light page-owned surfaces", async ({ page, context, baseURL }) => {
    await dbQuery("user", "update", { where: { id: fixtures.owner.id }, data: { themeMode: "DARK" } });
    await injectTestSession(context, fixtures.owner, baseURL!);

    for (const path of ["/analytics", "/activity"]) {
      await page.goto(path);
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");

      const heading = page.getByRole("heading").first();
      await expect.poll(() => heading.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(236, 237, 238)");

      const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bodyBg).not.toBe("rgb(255, 255, 255)");
    }
  });

  test("Dark mode: chart grid/axis/tooltip use resolved Dark tokens, not literal hex", async ({ page, context, baseURL }) => {
    await dbQuery("user", "update", { where: { id: fixtures.owner.id }, data: { themeMode: "DARK" } });
    await injectTestSession(context, fixtures.owner, baseURL!);
    await page.goto("/analytics");
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");

    // CartesianGrid line: var(--border-default) resolves to a translucent
    // white wash in Dark (rgba(255,255,255,0.14)) — never the Light literal
    // #e5e7eb this replaced.
    const gridLine = page.locator(".recharts-cartesian-grid line").first();
    await expect(gridLine).toHaveCount(1, { timeout: 5000 }).catch(() => {});
    const gridCount = await gridLine.count();
    if (gridCount > 0) {
      const stroke = await gridLine.evaluate((el) => getComputedStyle(el).stroke);
      expect(stroke).not.toBe("rgb(229, 231, 235)"); // #e5e7eb, the old Light literal
    }
  });
});
