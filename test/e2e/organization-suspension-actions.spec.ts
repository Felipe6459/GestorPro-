import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, dbQuery, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Platform Admin Organization Suspension, PR 2 — the mutation + UI half
 * of this feature. PR 1's own test/e2e/organization-suspension.spec.ts
 * already proves the read-side denial contract (dbQuery-set suspendedAt
 * only); this file is the first place any of it is driven through the
 * real Suspend/Reactivate controls on the Organization Detail page.
 */

// Must match playwright.config.ts's own fixed PLATFORM_ADMIN_EMAILS value
// exactly (see test/e2e/platform-admin-organizations.spec.ts's own
// identical constant) — this is the one identity the webServer's
// requirePlatformAdmin() allowlist actually recognizes.
const PLATFORM_ADMIN_EMAIL = "platform-admin-e2e@example.com";
const SECTION_TITLES = ["Business Identity", "Subscription", "Organization", "Team", "Usage", "Clients", "Projects", "Recent Activity"];

let fixtures: TestFixtures;
let orgAName: string;

test.beforeAll(async () => {
  fixtures = await seedE2EFixtures();
  const org = await dbQuery<{ name: string }>("organization", "findUniqueOrThrow", { where: { id: fixtures.orgA.id }, select: { name: true } });
  orgAName = org.name;
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
  await injectTestSession(context, { id: `e2e-susp-admin-${randomUUID()}`, email: PLATFORM_ADMIN_EMAIL }, baseURL);
  return context.newPage();
}

async function gotoDetail(page: Page) {
  await page.goto(`/platform-admin/organizations/${fixtures.orgA.id}`);
}

test.describe("Operator status display", () => {
  test("shows Active with a Suspend control when the organization is not suspended", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reactivate" })).toHaveCount(0);
  });

  test("shows Suspended since <date> with a Reactivate control when the organization is suspended", async ({ context, baseURL }) => {
    await dbQuery("organization", "update", { where: { id: fixtures.orgA.id }, data: { suspendedAt: new Date().toISOString() } });
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await expect(page.getByText(/^Suspended since /)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reactivate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend" })).toHaveCount(0);
  });
});

test.describe("Suspend flow", () => {
  test("the Suspend button requires both a selected reason and the exact organization name before it can be confirmed", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();

    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await expect(dialog).toBeVisible();
    const confirmButton = dialog.getByRole("button", { name: "Suspend" });
    await expect(confirmButton).toBeDisabled();

    await dialog.getByLabel("Reason").selectOption("POLICY_VIOLATION");
    await expect(confirmButton).toBeDisabled(); // name not yet typed

    await dialog.locator("input[type=text]").fill("wrong name");
    await expect(confirmButton).toBeDisabled(); // wrong name typed

    await dialog.locator("input[type=text]").fill(orgAName);
    await expect(confirmButton).toBeEnabled();
  });

  test("Cancel closes the dialog without suspending the organization", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();

    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");
    await dialog.locator("input[type=text]").fill(orgAName);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    const org = await dbQuery<{ suspendedAt: string | null }>("organization", "findUniqueOrThrow", {
      where: { id: fixtures.orgA.id },
      select: { suspendedAt: true },
    });
    expect(org.suspendedAt).toBeNull();
  });

  test("confirming suspends the organization, records one audit event, and updates the status display without a page reload", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();

    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("SECURITY_RISK");
    await dialog.locator("input[type=text]").fill(orgAName);
    await dialog.getByRole("button", { name: "Suspend" }).click();

    await expect(page.getByText("Organization suspended")).toBeVisible();
    await expect(page.getByText(/^Suspended since /)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reactivate" })).toBeVisible();

    const events = await dbQuery<Array<{ action: string; actorEmail: string; reasonCode: string | null }>>("platformAdminAuditEvent", "findMany", {
      where: { organizationId: fixtures.orgA.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "ORGANIZATION_SUSPENDED", actorEmail: PLATFORM_ADMIN_EMAIL, reasonCode: "SECURITY_RISK" });
  });

  test("the confirm button disables while pending, preventing a double submission (one audit row, not two)", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();

    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");
    await dialog.locator("input[type=text]").fill(orgAName);
    const confirmButton = dialog.getByRole("button", { name: "Suspend" });
    await confirmButton.click();
    // Immediately after the first click, the button must already be
    // disabled — a second, near-simultaneous click cannot reach the action.
    await expect(confirmButton).toBeDisabled();

    await expect(page.getByText("Organization suspended")).toBeVisible();
    const events = await dbQuery<unknown[]>("platformAdminAuditEvent", "findMany", { where: { organizationId: fixtures.orgA.id } });
    expect(events).toHaveLength(1);
  });

  test("staff access is blocked immediately after a real UI-driven suspend, and restored immediately after a real UI-driven reactivate", async ({
    browser,
    baseURL,
  }) => {
    // Two independent BrowserContexts, not one shared context: a second
    // injectTestSession() call on the same context would overwrite the
    // first identity's cookie for every page sharing it, including the
    // admin page's own later Server Action calls.
    const adminContext = await browser.newContext();
    const staffContext = await browser.newContext();
    try {
      const adminPage = await asAdmin(adminContext, baseURL!);
      await gotoDetail(adminPage);
      await adminPage.getByRole("button", { name: "Suspend" }).click();
      const suspendDialog = adminPage.getByRole("dialog", { name: "Suspend organization" });
      await suspendDialog.getByLabel("Reason").selectOption("OTHER");
      await suspendDialog.locator("input[type=text]").fill(orgAName);
      await suspendDialog.getByRole("button", { name: "Suspend" }).click();
      await expect(adminPage.getByText("Organization suspended")).toBeVisible();

      await injectTestSession(staffContext, { id: fixtures.owner.id, email: fixtures.owner.email }, baseURL!);
      const staffPage = await staffContext.newPage();
      await staffPage.goto("/dashboard");
      await expect(staffPage).toHaveURL(/\/organization-unavailable$/);

      await adminPage.getByRole("button", { name: "Reactivate" }).click();
      await adminPage.getByRole("dialog", { name: "Reactivate organization" }).getByRole("button", { name: "Reactivate" }).click();
      await expect(adminPage.getByText("Organization reactivated")).toBeVisible();

      await staffPage.goto("/dashboard");
      await expect(staffPage).toHaveURL(/\/dashboard/);
    } finally {
      await adminContext.close();
      await staffContext.close();
    }
  });
});

test.describe("Reactivate flow", () => {
  test.beforeEach(async () => {
    await dbQuery("organization", "update", { where: { id: fixtures.orgA.id }, data: { suspendedAt: new Date().toISOString() } });
  });

  test("requires confirmation but never requires typing the organization name", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Reactivate" }).click();

    const dialog = page.getByRole("dialog", { name: "Reactivate organization" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("input[type=text]")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Reactivate" })).toBeEnabled();
  });

  test("Cancel closes the dialog without reactivating", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Reactivate" }).click();
    const dialog = page.getByRole("dialog", { name: "Reactivate organization" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    const org = await dbQuery<{ suspendedAt: string | null }>("organization", "findUniqueOrThrow", {
      where: { id: fixtures.orgA.id },
      select: { suspendedAt: true },
    });
    expect(org.suspendedAt).not.toBeNull();
  });

  test("confirming reactivates the organization and records one ORGANIZATION_REACTIVATED audit event", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Reactivate" }).click();
    const dialog = page.getByRole("dialog", { name: "Reactivate organization" });
    await dialog.getByRole("button", { name: "Reactivate" }).click();

    await expect(page.getByText("Organization reactivated")).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();

    const events = await dbQuery<Array<{ action: string; reasonCode: string | null }>>("platformAdminAuditEvent", "findMany", {
      where: { organizationId: fixtures.orgA.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "ORGANIZATION_REACTIVATED", reasonCode: null });
  });
});

test.describe("Accessibility and disclosure", () => {
  test("the Suspend dialog never discloses the organization id, and Escape closes it without mutating anything", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    const dialogText = await dialog.innerText();
    expect(dialogText).not.toContain(fixtures.orgA.id);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const org = await dbQuery<{ suspendedAt: string | null }>("organization", "findUniqueOrThrow", {
      where: { id: fixtures.orgA.id },
      select: { suspendedAt: true },
    });
    expect(org.suspendedAt).toBeNull();
  });

  test("no horizontal overflow on the Organization Detail page with the suspension controls, at narrow, intermediate, and wide viewports", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoDetail(page);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `width=${width}`).toBeLessThanOrEqual(clientWidth);
    }
  });
});

test.describe("Regression — every existing Organization Detail section is still present", () => {
  test("all eight sections still render after a suspend/reactivate cycle", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const suspendDialog = page.getByRole("dialog", { name: "Suspend organization" });
    await suspendDialog.getByLabel("Reason").selectOption("OTHER");
    await suspendDialog.locator("input[type=text]").fill(orgAName);
    await suspendDialog.getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByText("Organization suspended")).toBeVisible();

    await page.getByRole("button", { name: "Reactivate" }).click();
    await page.getByRole("dialog", { name: "Reactivate organization" }).getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByText("Organization reactivated")).toBeVisible();

    for (const title of SECTION_TITLES) {
      await expect(page.getByRole("region", { name: title })).toBeVisible();
    }
  });
});
