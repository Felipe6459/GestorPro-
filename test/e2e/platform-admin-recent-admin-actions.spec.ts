import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, dbQuery, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Recent Admin Actions (Organization Detail) — the bounded, read-only
 * PlatformAdminAuditEvent preview added alongside the existing Recent
 * Activity section. organization-suspension-actions.spec.ts already
 * proves the mutation/audit-recording contract itself (one row per real
 * transition, correct action/reasonCode); this file proves the new
 * *display* of those same rows: empty state, correct labels, newest-
 * first ordering across a real Suspend → Reactivate cycle, and safe
 * wrapping for a long actor value.
 */

// Must match playwright.config.ts's own fixed PLATFORM_ADMIN_EMAILS value
// exactly — see organization-suspension-actions.spec.ts's own identical
// constant.
const PLATFORM_ADMIN_EMAIL = "platform-admin-e2e@example.com";

function confirmationPhrase(slug: string): string {
  return `SUSPEND ${slug}`;
}

let fixtures: TestFixtures;

test.beforeAll(async () => {
  fixtures = await seedE2EFixtures();
});

test.afterAll(async () => {
  await dbQuery("organization", "update", { where: { id: fixtures.orgA.id }, data: { suspendedAt: null } });
  await dbQuery("platformAdminAuditEvent", "deleteMany", { where: { organizationId: fixtures.orgA.id } });
  await cleanupTestData(fixtures);
});

test.afterEach(async () => {
  await dbQuery("organization", "update", { where: { id: fixtures.orgA.id }, data: { suspendedAt: null } });
  await dbQuery("platformAdminAuditEvent", "deleteMany", { where: { organizationId: fixtures.orgA.id } });
});

async function asAdmin(context: BrowserContext, baseURL: string): Promise<Page> {
  await injectTestSession(context, { id: `e2e-recent-admin-actions-${randomUUID()}`, email: PLATFORM_ADMIN_EMAIL }, baseURL);
  return context.newPage();
}

async function gotoDetail(page: Page) {
  await page.goto(`/platform-admin/organizations/${fixtures.orgA.id}`);
}

test("an organization with no admin actions recorded shows the empty state", async ({ context, baseURL }) => {
  const page = await asAdmin(context, baseURL!);
  await gotoDetail(page);
  const section = page.getByRole("region", { name: "Recent Admin Actions" });
  await expect(section.getByText("No admin actions recorded yet.")).toBeVisible();
});

test("a real Suspend action becomes visible with the correct action label, reason label, and actor", async ({ context, baseURL }) => {
  const page = await asAdmin(context, baseURL!);
  await gotoDetail(page);
  await page.getByRole("button", { name: "Suspend" }).click();
  const dialog = page.getByRole("dialog", { name: "Suspend organization" });
  await dialog.getByLabel("Reason").selectOption("POLICY_VIOLATION");
  await dialog.locator('input[type="text"]').fill(confirmationPhrase(fixtures.orgA.slug));
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Organization suspended")).toBeVisible();

  const section = page.getByRole("region", { name: "Recent Admin Actions" });
  await expect(section.getByText("Suspended")).toBeVisible();
  await expect(section.getByText("Policy violation")).toBeVisible();
  await expect(section.getByText(PLATFORM_ADMIN_EMAIL)).toBeVisible();
  await expect(section.getByText("No admin actions recorded yet.")).toHaveCount(0);
});

test("after a full Suspend then Reactivate cycle, the Reactivate row appears above the Suspend row (newest-first)", async ({
  context,
  baseURL,
}) => {
  const page = await asAdmin(context, baseURL!);
  await gotoDetail(page);

  await page.getByRole("button", { name: "Suspend" }).click();
  const suspendDialog = page.getByRole("dialog", { name: "Suspend organization" });
  await suspendDialog.getByLabel("Reason").selectOption("SECURITY_RISK");
  await suspendDialog.locator('input[type="text"]').fill(confirmationPhrase(fixtures.orgA.slug));
  await suspendDialog.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Organization suspended")).toBeVisible();

  await page.getByRole("button", { name: "Reactivate" }).click();
  await page.getByRole("dialog", { name: "Reactivate organization" }).getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByText("Organization reactivated")).toBeVisible();

  const section = page.getByRole("region", { name: "Recent Admin Actions" });
  const rows = section.locator("li");
  await expect(rows).toHaveCount(2);
  // Newest-first: Reactivate (the later action) must be the first row.
  await expect(rows.nth(0)).toContainText("Reactivated");
  await expect(rows.nth(1)).toContainText("Suspended");
  await expect(rows.nth(1)).toContainText("Security risk");
});

test("each row shows both an actor and a formatted timestamp", async ({ context, baseURL }) => {
  const page = await asAdmin(context, baseURL!);
  await gotoDetail(page);
  await page.getByRole("button", { name: "Suspend" }).click();
  const dialog = page.getByRole("dialog", { name: "Suspend organization" });
  await dialog.getByLabel("Reason").selectOption("OTHER");
  await dialog.locator('input[type="text"]').fill(confirmationPhrase(fixtures.orgA.slug));
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Organization suspended")).toBeVisible();

  const section = page.getByRole("region", { name: "Recent Admin Actions" });
  const row = section.locator("li").first();
  await expect(row.getByText(PLATFORM_ADMIN_EMAIL)).toBeVisible();
  await expect(row.locator("time")).toBeVisible();
  const datetime = await row.locator("time").getAttribute("datetime");
  expect(datetime).not.toBeNull();
});

test("a long actor email value wraps safely with no horizontal overflow at a narrow viewport", async ({ context, baseURL }) => {
  const longActorEmail = `${"platform-admin-with-an-unusually-long-local-part".repeat(3)}@example-marker-domain.test`;
  await dbQuery("platformAdminAuditEvent", "create", {
    data: {
      organizationId: fixtures.orgA.id,
      action: "ORGANIZATION_SUSPENDED",
      reasonCode: "OTHER",
      actorEmail: longActorEmail,
    },
  });

  const page = await asAdmin(context, baseURL!);
  await page.setViewportSize({ width: 375, height: 900 });
  await gotoDetail(page);

  const section = page.getByRole("region", { name: "Recent Admin Actions" });
  await expect(section.getByText(longActorEmail)).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("Recent Admin Actions never renders the organization's own id anywhere in the section", async ({ context, baseURL }) => {
  await dbQuery("platformAdminAuditEvent", "create", {
    data: { organizationId: fixtures.orgA.id, action: "ORGANIZATION_SUSPENDED", reasonCode: "OTHER", actorEmail: PLATFORM_ADMIN_EMAIL },
  });
  const page = await asAdmin(context, baseURL!);
  await gotoDetail(page);
  const section = page.getByRole("region", { name: "Recent Admin Actions" });
  const sectionText = await section.innerText();
  expect(sectionText).not.toContain(fixtures.orgA.id);
});
