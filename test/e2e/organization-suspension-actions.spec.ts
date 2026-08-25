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

/**
 * Confirmation-input hardening hotfix — discovered during a paused,
 * authorized Production Suspend cycle: the exact-name field had no
 * protection against browser/OS text assistance and gave no visible
 * feedback on a non-matching attempt. Uses a dedicated synthetic
 * organization (never fixtures.orgA) whose name deliberately contains an
 * ASCII apostrophe and other punctuation — the same shape as this app's
 * own default auto-provisioned "<name>'s Workspace" organizations,
 * the leading hypothesis for what the real Production attempt hit.
 */
test.describe("Confirmation input hardening (synthetic organization name with an apostrophe and punctuation)", () => {
  const SYNTHETIC_ORG_NAME = "Alex's Bistro & Co., Ltd.";
  let syntheticOrgId: string;

  test.beforeAll(async () => {
    const org = await dbQuery<{ id: string }>("organization", "create", {
      data: { name: SYNTHETIC_ORG_NAME, slug: `e2e-hardening-${randomUUID()}` },
    });
    syntheticOrgId = org.id;
  });

  test.afterAll(async () => {
    await dbQuery("platformAdminAuditEvent", "deleteMany", { where: { organizationId: syntheticOrgId } });
    await dbQuery("organization", "delete", { where: { id: syntheticOrgId } });
  });

  test.afterEach(async () => {
    await dbQuery("organization", "update", { where: { id: syntheticOrgId }, data: { suspendedAt: null } });
    await dbQuery("platformAdminAuditEvent", "deleteMany", { where: { organizationId: syntheticOrgId } });
  });

  async function gotoSyntheticDetail(page: Page) {
    await page.goto(`/platform-admin/organizations/${syntheticOrgId}`);
  }

  test("the confirmation input carries all four text-assistance-disabling attributes", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    const input = dialog.locator('input[type="text"]');
    await expect(input).toHaveAttribute("autocomplete", "off");
    await expect(input).toHaveAttribute("autocorrect", "off");
    await expect(input).toHaveAttribute("autocapitalize", "none");
    await expect(input).toHaveAttribute("spellcheck", "false");
  });

  test("a non-empty mismatch shows the accessible bounded message with aria-invalid/aria-describedby, and an exact match clears the mismatch-specific parts", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    const input = dialog.locator('input[type="text"]');

    // Discoverability hotfix: aria-describedby now always references the
    // exact-name reference block, even before anything is typed.
    const describedByBefore = await input.getAttribute("aria-describedby");
    expect(describedByBefore).not.toBeNull();
    await expect(input).not.toHaveAttribute("aria-invalid");

    // The curly-apostrophe variant — visually near-identical, a different code point.
    await input.fill("Alex’s Bistro & Co., Ltd.");
    await expect(dialog.getByText("Name does not match.")).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    const describedByDuringMismatch = await input.getAttribute("aria-describedby");
    expect(describedByDuringMismatch).not.toBeNull();
    // Now references both the reference block and the mismatch message —
    // aria-describedby is a space-separated id list, never a single CSS
    // selector (a bare space is a descendant combinator, not an id
    // separator).
    const ids = describedByDuringMismatch!.split(/\s+/);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const describedTexts = await Promise.all(ids.map((id) => dialog.locator(`#${id}`).innerText()));
    expect(describedTexts.join(" ")).toContain("Name does not match.");

    await input.fill(SYNTHETIC_ORG_NAME);
    await expect(dialog.getByText("Name does not match.")).toHaveCount(0);
    await expect(input).not.toHaveAttribute("aria-invalid");
    // Back to referencing only the reference block, exactly like before anything was typed.
    await expect(input).toHaveAttribute("aria-describedby", describedByBefore!);
  });

  test("is empty (no message, not disabled-looking-like-an-error) before anything is typed", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await expect(dialog.getByText("Name does not match.")).toHaveCount(0);
    await expect(dialog.locator('input[type="text"]')).not.toHaveAttribute("aria-invalid");
  });

  test("Suspend confirm stays disabled for every near-miss variant (case, whitespace, curly apostrophe, en dash) and enables only for the exact match", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");
    const input = dialog.locator('input[type="text"]');
    const confirmButton = dialog.getByRole("button", { name: "Suspend" });

    for (const variant of [
      SYNTHETIC_ORG_NAME.toLowerCase(),
      SYNTHETIC_ORG_NAME.toUpperCase(),
      `${SYNTHETIC_ORG_NAME} `,
      SYNTHETIC_ORG_NAME.replace("'", "’"), // curly apostrophe
      SYNTHETIC_ORG_NAME.replace("&", "–"), // en dash swapped in for a punctuation character
    ]) {
      await input.fill(variant);
      await expect(confirmButton).toBeDisabled();
    }

    await input.fill(SYNTHETIC_ORG_NAME);
    await expect(confirmButton).toBeEnabled();
  });

  test("Cancel performs zero mutation even after a mismatch was shown", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");
    await dialog.locator('input[type="text"]').fill("definitely wrong");
    await expect(dialog.getByText("Name does not match.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    const org = await dbQuery<{ suspendedAt: string | null }>("organization", "findUniqueOrThrow", {
      where: { id: syntheticOrgId },
      select: { suspendedAt: true },
    });
    expect(org.suspendedAt).toBeNull();
    const events = await dbQuery<unknown[]>("platformAdminAuditEvent", "findMany", { where: { organizationId: syntheticOrgId } });
    expect(events).toHaveLength(0);
  });

  test("one exact confirmation submits exactly once and suspends the organization with a single audit row", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");
    await dialog.locator('input[type="text"]').fill(SYNTHETIC_ORG_NAME);
    await dialog.getByRole("button", { name: "Suspend" }).click();

    await expect(page.getByText("Organization suspended")).toBeVisible();

    const events = await dbQuery<unknown[]>("platformAdminAuditEvent", "findMany", { where: { organizationId: syntheticOrgId } });
    expect(events).toHaveLength(1);
  });
});

/**
 * Expected-name discoverability hotfix — discovered when a real operator
 * could not find the full expected organization name anywhere reliably
 * readable during a paused, authorized Production Suspend cycle: the
 * page header could visually clip/squeeze a long name, and the dialog's
 * own former inline rendering shared the same unprotected string.
 *
 * These tests never click the final Suspend confirmation (per this
 * hotfix's own explicit scope) — every one either checks enabled/
 * disabled state or ends by clicking Cancel.
 */
test.describe("Expected-name discoverability (dedicated reference block)", () => {
  const LONG_MULTIWORD_NAME = "Silver Oak Mountain Ridge Consulting and Advisory Partners International Group, LLC";
  const LONG_UNBROKEN_NAME = `${"X".repeat(120)}Corp`; // one unbroken token, no spaces at all
  const PUNCTUATED_NAME = "O'Brien & Sons, Inc.";

  let longMultiwordOrgId: string;
  let longUnbrokenOrgId: string;
  let punctuatedOrgId: string;

  test.beforeAll(async () => {
    const [a, b, c] = await Promise.all([
      dbQuery<{ id: string }>("organization", "create", { data: { name: LONG_MULTIWORD_NAME, slug: `e2e-disco-multiword-${randomUUID()}` } }),
      dbQuery<{ id: string }>("organization", "create", { data: { name: LONG_UNBROKEN_NAME, slug: `e2e-disco-unbroken-${randomUUID()}` } }),
      dbQuery<{ id: string }>("organization", "create", { data: { name: PUNCTUATED_NAME, slug: `e2e-disco-punct-${randomUUID()}` } }),
    ]);
    longMultiwordOrgId = a.id;
    longUnbrokenOrgId = b.id;
    punctuatedOrgId = c.id;
  });

  test.afterAll(async () => {
    for (const id of [longMultiwordOrgId, longUnbrokenOrgId, punctuatedOrgId]) {
      await dbQuery("platformAdminAuditEvent", "deleteMany", { where: { organizationId: id } });
      await dbQuery("organization", "delete", { where: { id } });
    }
  });

  test.afterEach(async () => {
    for (const id of [longMultiwordOrgId, longUnbrokenOrgId, punctuatedOrgId]) {
      await dbQuery("organization", "update", { where: { id }, data: { suspendedAt: null } });
      await dbQuery("platformAdminAuditEvent", "deleteMany", { where: { organizationId: id } });
    }
  });

  async function gotoOrgDetail(page: Page, orgId: string) {
    await page.goto(`/platform-admin/organizations/${orgId}`);
  }

  test("the reference block renders a long multi-word name in full, with no horizontal overflow at narrow and wide viewports", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoOrgDetail(page, longMultiwordOrgId);
      await page.getByRole("button", { name: "Suspend" }).click();
      const dialog = page.getByRole("dialog", { name: "Suspend organization" });
      await expect(dialog.getByText(LONG_MULTIWORD_NAME)).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `width=${width}`).toBeLessThanOrEqual(clientWidth);
      await page.keyboard.press("Escape");
    }
  });

  test("the reference block renders a long unbroken (no-space) name in full, wrapped safely, with no horizontal overflow", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoOrgDetail(page, longUnbrokenOrgId);
      await page.getByRole("button", { name: "Suspend" }).click();
      const dialog = page.getByRole("dialog", { name: "Suspend organization" });
      await expect(dialog.getByText(LONG_UNBROKEN_NAME)).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `width=${width}`).toBeLessThanOrEqual(clientWidth);
      await page.keyboard.press("Escape");
    }
  });

  test("the page header itself also has no horizontal overflow for a long unbroken name, at narrow and wide viewports", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoOrgDetail(page, longUnbrokenOrgId);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `width=${width}`).toBeLessThanOrEqual(clientWidth);
    }
  });

  test("selecting the displayed expected value and pasting it into the confirmation input enables Suspend, for a name with an apostrophe and punctuation", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoOrgDetail(page, punctuatedOrgId);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");

    // Simulates "select the reference block (select-all), copy, paste into
    // the input" without depending on the real OS clipboard (not reliable
    // in a headless CI browser): reads the reference block's own text
    // content — exactly what a select-all click would select — and pastes
    // that into the input, proving the *value* the block exposes is the
    // exact value the confirmation needs.
    const referenceText = await dialog.locator("p.select-all").innerText();
    expect(referenceText).toBe(PUNCTUATED_NAME);
    await dialog.locator('input[type="text"]').fill(referenceText);

    await expect(dialog.getByRole("button", { name: "Suspend" })).toBeEnabled();
  });

  test("adding one character to an otherwise-exact match disables Suspend and shows the mismatch message; removing it restores the enabled state", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoOrgDetail(page, punctuatedOrgId);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");
    const input = dialog.locator('input[type="text"]');
    const confirmButton = dialog.getByRole("button", { name: "Suspend" });

    await input.fill(PUNCTUATED_NAME);
    await expect(confirmButton).toBeEnabled();

    await input.fill(`${PUNCTUATED_NAME}!`);
    await expect(confirmButton).toBeDisabled();
    await expect(dialog.getByText("Name does not match.")).toBeVisible();

    await input.fill(PUNCTUATED_NAME);
    await expect(dialog.getByText("Name does not match.")).toHaveCount(0);
    await expect(confirmButton).toBeEnabled();
  });

  test("Cancel submits no mutation, even after the reference block was used to reach an exact, enabled match", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoOrgDetail(page, punctuatedOrgId);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");
    await dialog.locator('input[type="text"]').fill(PUNCTUATED_NAME);
    await expect(dialog.getByRole("button", { name: "Suspend" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    const org = await dbQuery<{ suspendedAt: string | null }>("organization", "findUniqueOrThrow", {
      where: { id: punctuatedOrgId },
      select: { suspendedAt: true },
    });
    expect(org.suspendedAt).toBeNull();
    const events = await dbQuery<unknown[]>("platformAdminAuditEvent", "findMany", { where: { organizationId: punctuatedOrgId } });
    expect(events).toHaveLength(0);
  });
});
