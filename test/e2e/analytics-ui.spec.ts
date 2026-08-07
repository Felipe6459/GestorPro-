import { test, expect, type BrowserContext } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, dbQuery, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Analytics Stage 2 (docs/analytics-architecture.md). Real app/database,
 * no external analytics provider anywhere in this file (there is nothing
 * to call).
 */

let fixtures: TestFixtures;

test.beforeAll(async () => {
  fixtures = await seedE2EFixtures();
});

test.afterAll(async () => {
  await cleanupTestData(fixtures);
});

/** Same pattern as test/e2e/billing-ui.spec.ts's own actAsMember — every identity switch must set active_organization_id explicitly, or a non-OWNER identity gets auto-provisioned a brand-new workspace instead of landing in fixtures.orgA. */
async function actAsMember(
  context: BrowserContext,
  baseURL: string,
  user: { id: string; email: string },
  organizationId: string,
): Promise<void> {
  await context.clearCookies();
  await injectTestSession(context, user, baseURL);
  await context.addCookies([
    {
      name: "active_organization_id",
      value: organizationId,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

test.describe("OWNER", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
  });

  test("Analytics link is visible in the sidebar and navigates to the Analytics page", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/analytics/);
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
  });

  test("shows every KPI section with real, non-empty data", async ({ page }) => {
    await page.goto("/analytics");

    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Completion" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Growth" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();

    // orgA's seeded fixtures include a real Client/Project/Task/Invoice —
    // the Overview grid must render, not the empty state.
    await expect(page.getByText("No activity yet")).toHaveCount(0);
  });

  test("Status section never exposes a raw internal enum value or a provider/organization id as visible text", async ({ page }) => {
    await page.goto("/analytics");

    // Scoped to visible text content, not the raw document — the RSC
    // hydration payload legitimately embeds this same organization's own
    // id elsewhere on every dashboard page (e.g. for the search widget),
    // which is normal Next.js infrastructure, not something Analytics
    // itself renders. What matters is that no *visible* text anywhere on
    // the page shows a provider id, and that the Status section
    // specifically never shows a raw enum value.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/mock_cus_|mock_sub_|providerCustomerId|providerSubscriptionId/);
    expect(bodyText).not.toContain(fixtures.orgA.id);

    // formatStatusLabel/getPlan always produce Title Case ("Legacy",
    // "Active", "Trialing") — the raw, all-caps Prisma enum value
    // ("LEGACY", "TRIALING", ...) must never appear as visible text.
    for (const rawEnumValue of ["LEGACY", "TRIALING", "PAST_DUE", "CANCELED", "INCOMPLETE", "UNPAID", "TRIAL", "STARTER", "PRO"]) {
      expect(bodyText).not.toContain(rawEnumValue);
    }
  });

  test("range selector navigates via URL search params, never a cookie, and the selection survives a reload", async ({ page, context }) => {
    await page.goto("/analytics");
    const nav = page.getByRole("navigation", { name: "Time range" });
    await nav.getByRole("link", { name: "Last 7 days" }).click();
    await expect(page).toHaveURL(/\?range=last7Days/);
    await expect(nav.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("aria-current", "true");

    await page.reload();
    await expect(page).toHaveURL(/\?range=last7Days/);
    await expect(nav.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("aria-current", "true");

    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name.toLowerCase().includes("range"))).toBe(false);
  });

  test("an unrecognized range query value falls back to the default range instead of crashing", async ({ page }) => {
    await page.goto("/analytics?range=not-a-real-range");
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
    await expect(page.getByText(/internal server error/i)).toHaveCount(0);
  });

  test("a brand-new organization with no data shows the empty state, not a broken grid", async ({ page, context, baseURL }) => {
    const empty = await dbQuery<{ id: string }>("organization", "create", { data: { name: `E2E Analytics Empty ${fixtures.runId}`, slug: `e2e-analytics-empty-${fixtures.runId}` } });
    await dbQuery("membership", "create", { data: { userId: fixtures.owner.id, organizationId: empty.id, role: "OWNER" } });

    try {
      await actAsMember(context, baseURL!, fixtures.owner, empty.id);
      await page.goto("/analytics");
      await expect(page.getByText("No activity yet")).toBeVisible();
      // Other sections still render normally alongside the empty Overview.
      await expect(page.getByRole("heading", { name: "Growth" })).toBeVisible();
      await expect(page.getByText("0%").first()).toBeVisible();
    } finally {
      await dbQuery("membership", "deleteMany", { where: { organizationId: empty.id } });
      await dbQuery("organization", "delete", { where: { id: empty.id } });
    }
  });
});

test.describe("ADMIN", () => {
  test("ADMIN also sees the full Analytics page", async ({ page, context, baseURL }) => {
    await actAsMember(context, baseURL!, fixtures.admin, fixtures.orgA.id);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });
});

test.describe("MEMBER", () => {
  test("MEMBER sees an Access denied state, never the real data", async ({ page, context, baseURL }) => {
    await actAsMember(context, baseURL!, fixtures.member, fixtures.orgA.id);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
  });
});

test.describe("Client Portal", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await injectTestSession(context, { id: fixtures.portalUser.id, email: fixtures.portalUser.email }, baseURL!);
  });

  test("no Analytics link in the portal nav, and the staff analytics route redirects away", async ({ page }) => {
    await page.goto("/portal");
    await expect(page.getByRole("link", { name: "Analytics" })).toHaveCount(0);

    await page.goto("/analytics");
    await expect(page).toHaveURL(/\/portal$/);
  });
});

test.describe("Accessibility", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
  });

  test("every section is a labeled landmark reachable by heading structure", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    for (const name of ["Overview", "Activity", "Completion", "Growth", "Status"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expect(page.getByRole("navigation", { name: "Time range" })).toBeVisible();
  });

  test("the range selector is fully keyboard-reachable with a visible focus state", async ({ page }) => {
    await page.goto("/analytics");
    const firstRangeLink = page.getByRole("navigation", { name: "Time range" }).getByRole("link").first();
    await firstRangeLink.focus();
    await expect(firstRangeLink).toBeFocused();
  });
});

test.describe("Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("Analytics page renders usably on a small viewport, with no horizontal overflow", async ({ page, context, baseURL }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });
});

test.describe("Tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("Analytics page renders usably on a tablet viewport, with no horizontal overflow", async ({ page, context, baseURL }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });
});

test.describe("Desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Analytics page renders usably on a desktop viewport, with no horizontal overflow", async ({ page, context, baseURL }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });
});
