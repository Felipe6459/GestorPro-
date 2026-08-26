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
 *
 * ORGANIZATION_IDENTITY_CONFIRMATION_DESIGN correction: confirmation is
 * now the fixed phrase `SUSPEND <slug>`, never Organization.name — see
 * organization-suspension-confirmation.ts's own header comment for the
 * full reasoning. fixtures.orgA.slug (already part of TestFixtures) is
 * used directly; no separate name lookup is needed anymore.
 */

// Must match playwright.config.ts's own fixed PLATFORM_ADMIN_EMAILS value
// exactly (see test/e2e/platform-admin-organizations.spec.ts's own
// identical constant) — this is the one identity the webServer's
// requirePlatformAdmin() allowlist actually recognizes.
const PLATFORM_ADMIN_EMAIL = "platform-admin-e2e@example.com";
const SECTION_TITLES = ["Business Identity", "Subscription", "Organization", "Team", "Usage", "Clients", "Projects", "Recent Activity"];

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
  test("the Suspend button requires both a selected reason and the exact SUSPEND <slug> phrase before it can be confirmed", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();

    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await expect(dialog).toBeVisible();
    const confirmButton = dialog.getByRole("button", { name: "Suspend" });
    await expect(confirmButton).toBeDisabled();

    await dialog.getByLabel("Reason").selectOption("POLICY_VIOLATION");
    await expect(confirmButton).toBeDisabled(); // phrase not yet typed

    await dialog.locator("input[type=text]").fill("wrong phrase");
    await expect(confirmButton).toBeDisabled(); // wrong phrase typed

    await dialog.locator("input[type=text]").fill(confirmationPhrase(fixtures.orgA.slug));
    await expect(confirmButton).toBeEnabled();
  });

  test("Cancel closes the dialog without suspending the organization", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();

    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");
    await dialog.locator("input[type=text]").fill(confirmationPhrase(fixtures.orgA.slug));
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
    await dialog.locator("input[type=text]").fill(confirmationPhrase(fixtures.orgA.slug));
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
    await dialog.locator("input[type=text]").fill(confirmationPhrase(fixtures.orgA.slug));
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
      await suspendDialog.locator("input[type=text]").fill(confirmationPhrase(fixtures.orgA.slug));
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

  test("requires confirmation but never requires typing anything", async ({ context, baseURL }) => {
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
    await suspendDialog.locator("input[type=text]").fill(confirmationPhrase(fixtures.orgA.slug));
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
 * Confirmation-phrase hardening. Uses a dedicated synthetic organization
 * (never fixtures.orgA) whose name deliberately contains an ASCII
 * apostrophe and other punctuation — the same shape as this app's own
 * default auto-provisioned "<name>'s Workspace" organizations. Under
 * ORGANIZATION_IDENTITY_CONFIRMATION_DESIGN, that name plays no role in
 * confirmation at all anymore (only the organization's own slug does) —
 * kept here specifically to prove that structurally: an org whose name
 * would have broken the old contract confirms cleanly under the new one.
 */
test.describe("Confirmation input hardening (synthetic organization with an apostrophe/punctuation name, confirmed via its slug)", () => {
  const SYNTHETIC_ORG_NAME = "Alex's Bistro & Co., Ltd.";
  let syntheticOrgId: string;
  let syntheticOrgSlug: string;

  test.beforeAll(async () => {
    const slug = `e2e-hardening-${randomUUID()}`;
    const org = await dbQuery<{ id: string }>("organization", "create", {
      data: { name: SYNTHETIC_ORG_NAME, slug },
    });
    syntheticOrgId = org.id;
    syntheticOrgSlug = slug;
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

  test("the dialog states the slug-based phrase, never the organization's name", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    const dialogText = await dialog.innerText();
    expect(dialogText).toContain(confirmationPhrase(syntheticOrgSlug));
    expect(dialogText).not.toContain(SYNTHETIC_ORG_NAME);
  });

  test("a non-empty mismatch shows the accessible bounded message with aria-invalid/aria-describedby, and an exact match clears both", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    const input = dialog.locator('input[type="text"]');

    await expect(input).not.toHaveAttribute("aria-invalid");
    await expect(input).not.toHaveAttribute("aria-describedby");

    await input.fill(SYNTHETIC_ORG_NAME); // the old contract's own value — never valid under the new one
    await expect(dialog.getByText("Doesn't match.")).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = await input.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    await expect(dialog.locator(`#${describedBy}`)).toHaveText("Doesn't match.");

    await input.fill(confirmationPhrase(syntheticOrgSlug));
    await expect(dialog.getByText("Doesn't match.")).toHaveCount(0);
    await expect(input).not.toHaveAttribute("aria-invalid");
    await expect(input).not.toHaveAttribute("aria-describedby");
  });

  test("is empty (no message) before anything is typed", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await expect(dialog.getByText("Doesn't match.")).toHaveCount(0);
    await expect(dialog.locator('input[type="text"]')).not.toHaveAttribute("aria-invalid");
  });

  test("Suspend confirm stays disabled for every near-miss variant (missing prefix, wrong slug, case change, trailing space, extra character, the old name-based text) and enables only for the exact phrase", async ({
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
    const phrase = confirmationPhrase(syntheticOrgSlug);

    for (const variant of [
      syntheticOrgSlug, // missing "SUSPEND " prefix
      `SUSPEND wrong-slug-${randomUUID().slice(0, 8)}`, // wrong slug
      phrase.toLowerCase(),
      `${phrase} `,
      `${phrase}!`,
      SYNTHETIC_ORG_NAME, // the old, replaced contract's own value
    ]) {
      await input.fill(variant);
      await expect(confirmButton).toBeDisabled();
    }

    await input.fill(phrase);
    await expect(confirmButton).toBeEnabled();
  });

  test("Cancel performs zero mutation even after a mismatch was shown", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoSyntheticDetail(page);
    await page.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend organization" });
    await dialog.getByLabel("Reason").selectOption("OTHER");
    await dialog.locator('input[type="text"]').fill("definitely wrong");
    await expect(dialog.getByText("Doesn't match.")).toBeVisible();
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
    await dialog.locator('input[type="text"]').fill(confirmationPhrase(syntheticOrgSlug));
    await dialog.getByRole("button", { name: "Suspend" }).click();

    await expect(page.getByText("Organization suspended")).toBeVisible();

    const events = await dbQuery<unknown[]>("platformAdminAuditEvent", "findMany", { where: { organizationId: syntheticOrgId } });
    expect(events).toHaveLength(1);
  });
});

/**
 * ORGANIZATION_IDENTITY_CONFIRMATION_DESIGN correction: the dialog's own
 * former "Exact organization name" reference block is gone; the full
 * name's one permanent home is now the Organization Detail page's own
 * "Organization" section (the new "Name" field). These tests prove that
 * field remains fully visible/wrapped/overflow-free for long or unusual
 * names, and that the dialog itself never falls back to showing the
 * name again.
 */
test.describe("Organization Name field discoverability (Organization Detail section)", () => {
  const LONG_MULTIWORD_NAME = "Silver Oak Mountain Ridge Consulting and Advisory Partners International Group, LLC";
  const LONG_UNBROKEN_NAME = `${"X".repeat(120)}Corp`; // one unbroken token, no spaces at all

  let longMultiwordOrgId: string;
  let longUnbrokenOrgId: string;

  test.beforeAll(async () => {
    const [a, b] = await Promise.all([
      dbQuery<{ id: string }>("organization", "create", { data: { name: LONG_MULTIWORD_NAME, slug: `e2e-name-multiword-${randomUUID()}` } }),
      dbQuery<{ id: string }>("organization", "create", { data: { name: LONG_UNBROKEN_NAME, slug: `e2e-name-unbroken-${randomUUID()}` } }),
    ]);
    longMultiwordOrgId = a.id;
    longUnbrokenOrgId = b.id;
  });

  test.afterAll(async () => {
    for (const id of [longMultiwordOrgId, longUnbrokenOrgId]) {
      await dbQuery("organization", "delete", { where: { id } });
    }
  });

  async function gotoOrgDetail(page: Page, orgId: string) {
    await page.goto(`/platform-admin/organizations/${orgId}`);
  }

  test("the Organization section's Name field renders a long multi-word name in full, with no horizontal overflow at narrow and wide viewports", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoOrgDetail(page, longMultiwordOrgId);
      const orgSection = page.getByRole("region", { name: "Organization" });
      await expect(orgSection.getByText(LONG_MULTIWORD_NAME)).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `width=${width}`).toBeLessThanOrEqual(clientWidth);
    }
  });

  test("the Organization section's Name field renders a long unbroken (no-space) name in full, wrapped safely, with no horizontal overflow", async ({
    context,
    baseURL,
  }) => {
    const page = await asAdmin(context, baseURL!);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoOrgDetail(page, longUnbrokenOrgId);
      const orgSection = page.getByRole("region", { name: "Organization" });
      await expect(orgSection.getByText(LONG_UNBROKEN_NAME)).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `width=${width}`).toBeLessThanOrEqual(clientWidth);
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

  test("the Name field's value is manually selectable (select-all)", async ({ context, baseURL }) => {
    const page = await asAdmin(context, baseURL!);
    await gotoOrgDetail(page, longMultiwordOrgId);
    const orgSection = page.getByRole("region", { name: "Organization" });
    const nameValue = orgSection.locator("dd").filter({ hasText: LONG_MULTIWORD_NAME }).first();
    await expect(nameValue.locator(".select-all")).toHaveText(LONG_MULTIWORD_NAME);
  });
});
