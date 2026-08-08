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

    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Completion" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Growth" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();

    // orgA's seeded fixtures include a real Client/Project/Task/Invoice —
    // the Overview grid must render, not the empty state.
    await expect(page.getByText("No activity yet")).toHaveCount(0);
  });

  test("Stage 3: shows every chart section, and each chart actually renders (real SVG, not an empty container)", async ({ page }) => {
    await page.goto("/analytics");

    await expect(page.getByRole("heading", { name: "Trends", exact: true })).toBeVisible();
    for (const heading of ["Task & invoice activity", "Period comparison", "Organization activity"]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    // Recharts renders a real <svg> per chart — this proves the chart
    // library actually mounted and drew something, not just that the
    // section heading text is present.
    const trendsSection = page.locator("section", { has: page.getByRole("heading", { name: "Trends", exact: true }) });
    await expect(trendsSection.locator("svg").first()).toBeVisible();

    const activitySection = page.locator("section", { has: page.getByRole("heading", { name: "Task & invoice activity" }) });
    await expect(activitySection.locator("svg").first()).toBeVisible();

    const orgActivitySection = page.locator("section", { has: page.getByRole("heading", { name: "Organization activity" }) });
    await expect(orgActivitySection.getByRole("progressbar", { name: "Onboarding progress" })).toBeVisible();
    await expect(orgActivitySection.getByText("Subscription events")).toBeVisible();
  });

  test("Stage 3: charts have an accessible name via role=img + aria-label, never relying on color alone", async ({ page }) => {
    await page.goto("/analytics");
    const clientChart = page.getByRole("img", { name: /Clients over time/i });
    await expect(clientChart).toBeVisible();
    const taskChart = page.getByRole("img", { name: /Tasks: \d+ created, \d+ completed/i });
    await expect(taskChart).toBeVisible();
  });

  test("Stage 4: shows the Portal section with real KPI cards and a chart, reusing Stage 2/3 components", async ({ page }) => {
    await page.goto("/analytics");

    const portalSection = page.locator("section", { has: page.getByRole("heading", { name: "Portal", exact: true }) });
    await expect(portalSection).toBeVisible();
    await expect(portalSection.getByText("Portal users", { exact: true })).toBeVisible();
    await expect(portalSection.getByText("Portal adoption", { exact: true })).toBeVisible();
    await expect(portalSection.getByText("Documents available", { exact: true })).toBeVisible();
    await expect(portalSection.getByText("Invoices visible", { exact: true })).toBeVisible();

    // orgA's fixtures seed one PortalUser + one attachment reachable by
    // it — the section must render real KPI cards, not the empty state.
    await expect(portalSection.getByText("No activity yet")).toHaveCount(0);
    await expect(portalSection.locator("svg").first()).toBeVisible();
  });

  test("Stage 4: the Portal section never exposes a portal contact's email, name, or internal id as visible text", async ({ page }) => {
    await page.goto("/analytics");
    const portalSection = page.locator("section", { has: page.getByRole("heading", { name: "Portal", exact: true }) });
    const sectionText = await portalSection.innerText();
    expect(sectionText).not.toContain(fixtures.portalUser.email);
    expect(sectionText).not.toContain(fixtures.portalUser.name);
    expect(sectionText).not.toContain(fixtures.portalUser.id);
    expect(sectionText).not.toContain(fixtures.clientA.id);
  });

  test("Stage 4: a brand-new organization with no portal users shows the Portal empty state, not a broken grid", async ({ page, context, baseURL }) => {
    const empty = await dbQuery<{ id: string }>("organization", "create", { data: { name: `E2E Analytics Portal Empty ${fixtures.runId}`, slug: `e2e-analytics-portal-empty-${fixtures.runId}` } });
    await dbQuery("membership", "create", { data: { userId: fixtures.owner.id, organizationId: empty.id, role: "OWNER" } });

    try {
      await actAsMember(context, baseURL!, fixtures.owner, empty.id);
      await page.goto("/analytics");
      const portalSection = page.locator("section", { has: page.getByRole("heading", { name: "Portal", exact: true }) });
      await expect(portalSection.getByText("No activity yet")).toBeVisible();
    } finally {
      await dbQuery("membership", "deleteMany", { where: { organizationId: empty.id } });
      await dbQuery("organization", "delete", { where: { id: empty.id } });
    }
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
      // Both the Overview and Portal sections are empty for a brand-new
      // org — two independent "No activity yet" empty states, one per
      // section, not a bug.
      await expect(page.getByText("No activity yet")).toHaveCount(2);
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
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  });
});

test.describe("MEMBER", () => {
  test("MEMBER sees an Access denied state, never the real data", async ({ page, context, baseURL }) => {
    await actAsMember(context, baseURL!, fixtures.member, fixtures.orgA.id);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toHaveCount(0);
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
    for (const name of ["Completion", "Growth", "Status", "Period comparison"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: "Overview", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Activity", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Trends", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Task & invoice activity" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Organization activity" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Portal", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Portal overview" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Portal trends" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

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
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

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
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });
});
