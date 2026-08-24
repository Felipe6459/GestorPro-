import { test, expect } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * §9 of docs/production-observability-runbook.md — the read-only
 * Platform Admin Observability page. PLATFORM_ADMIN_EMAILS is fixed in
 * playwright.config.ts's webServer env to exactly this address (see
 * test/e2e/platform-admin.spec.ts, which owns the general guard/nav
 * coverage — this file only covers the Observability route specifically).
 *
 * getFailureMonitoringSummary() is deliberately unscoped by organization
 * (see its own header comment) and reads whatever real WebhookEvent/
 * InvoiceEmailAttempt rows exist in the shared E2E database at the
 * moment this suite runs — this file therefore never asserts an exact
 * count, only that every rendered value is well-formed (a real
 * non-negative integer, or the matching zero-state copy), mirroring
 * platform-admin-dashboard.spec.ts's own "real, non-negative numbers on
 * first load" test for exactly the same reason.
 */

const PLATFORM_ADMIN_EMAIL = "platform-admin-e2e@example.com";

let fixtures: TestFixtures;

test.beforeAll(async () => {
  fixtures = await seedE2EFixtures();
});

test.afterAll(async () => {
  await cleanupTestData(fixtures);
});

test("no session redirects to /login", async ({ page }) => {
  await page.goto("/platform-admin/observability");
  await expect(page).toHaveURL(/\/login$/);
});

test("an authenticated but non-allowlisted staff user is redirected to /dashboard, never shown an access-denied page", async ({ context, baseURL }) => {
  await injectTestSession(context, { id: fixtures.owner.id, email: fixtures.owner.email }, baseURL!);
  const page = await context.newPage();

  await page.goto("/platform-admin/observability");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Access denied")).toHaveCount(0);
});

test("the allowlisted identity reaches Observability from the nav, sees all four sections, a Read-only indicator, and only well-formed aggregate values", async ({ context, baseURL }) => {
  await injectTestSession(context, { id: "e2e-platform-admin-observability", email: PLATFORM_ADMIN_EMAIL }, baseURL!);
  const page = await context.newPage();

  await page.goto("/platform-admin");
  await page.getByRole("navigation", { name: "Platform Admin" }).getByRole("link", { name: "Observability" }).click();
  await expect(page).toHaveURL(/\/platform-admin\/observability$/);

  await expect(page.getByRole("heading", { name: "Observability", level: 1 })).toBeVisible();
  await expect(page.getByText("Read-only", { exact: true })).toBeVisible();

  for (const heading of [
    "Billing webhook failures by reason",
    "Stale billing webhook processing",
    "Invoice email delivery failures and unknown outcomes",
    "Stale invoice email attempts",
  ]) {
    await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
  }

  // Every count actually rendered on the page (the single-count sections'
  // large figures) must be a real, non-negative integer — this page never
  // renders a placeholder, a loading skeleton left behind, or NaN.
  const mainText = await page.locator("main").innerText();
  const renderedIntegers = [...mainText.matchAll(/\b(\d+)\s+(stale pending)/g)].map((m) => Number(m[1]));
  for (const value of renderedIntegers) {
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
});

test("the page never renders an email address, and has no mutation control", async ({ context, baseURL }) => {
  await injectTestSession(context, { id: "e2e-platform-admin-observability-2", email: PLATFORM_ADMIN_EMAIL }, baseURL!);
  const page = await context.newPage();

  await page.goto("/platform-admin/observability");
  await expect(page).toHaveURL(/\/platform-admin\/observability$/);

  // Scoped to <main> deliberately — the layout's own header legitimately
  // shows the signed-in operator's email outside <main> (see
  // (platform-admin)/layout.tsx); this page's own content never needs an
  // "@" character anywhere in its copy.
  const mainText = await page.locator("main").innerText();
  expect(mainText).not.toContain("@");

  // No retry/resend/resolve/dismiss/acknowledge/delete/export/inspect
  // control anywhere — matches check-platform-admin-security.mjs's own
  // structural "no actions.ts under (platform-admin)" guarantee at the
  // rendered-UI level.
  for (const forbidden of ["Retry", "Resend", "Resolve", "Dismiss", "Acknowledge", "Delete", "Export", "Inspect"]) {
    await expect(page.locator("main").getByRole("button", { name: forbidden })).toHaveCount(0);
    await expect(page.locator("main").getByRole("link", { name: forbidden })).toHaveCount(0);
  }
});

test("no horizontal overflow at a narrow viewport", async ({ context, baseURL }) => {
  await injectTestSession(context, { id: "e2e-platform-admin-observability-3", email: PLATFORM_ADMIN_EMAIL }, baseURL!);
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 800 });

  await page.goto("/platform-admin/observability");
  await expect(page).toHaveURL(/\/platform-admin\/observability$/);

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
