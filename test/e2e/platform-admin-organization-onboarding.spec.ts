import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { dbQuery } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Platform Admin Onboarding (Organization Detail, read-only). Reuses the
 * exact same authoritative engine the tenant Dashboard already uses
 * (getOrganizationOnboardingProgress()); this file proves the *display*
 * of that data on Organization Detail: the section renders, shows real
 * step labels/statuses, stays read-only, and never leaks a tenant-only
 * onboarding route. Every organization is created directly (never a
 * shared fixture) so its onboarding state is fully under this file's own
 * control.
 */

const PLATFORM_ADMIN_EMAIL = "platform-admin-e2e@example.com";

async function asAdmin(context: BrowserContext, baseURL: string): Promise<Page> {
  await injectTestSession(context, { id: `e2e-onboarding-${randomUUID()}`, email: PLATFORM_ADMIN_EMAIL }, baseURL);
  return context.newPage();
}

async function createOrg(name: string): Promise<{ id: string }> {
  return dbQuery<{ id: string }>("organization", "create", {
    data: { name, slug: `e2e-onboarding-${randomUUID()}` },
  });
}

async function cleanupOrg(orgId: string) {
  await dbQuery("organization", "deleteMany", { where: { id: orgId } });
}

test("the Onboarding section renders on Organization Detail with real step labels and statuses for a fresh organization", async ({
  context,
  baseURL,
}) => {
  const org = await createOrg(`Onboarding E2E ${randomUUID()}`);
  try {
    const page = await asAdmin(context, baseURL!);
    await page.goto(`/platform-admin/organizations/${org.id}`);

    const section = page.getByRole("region", { name: "Onboarding" });
    await expect(section).toBeVisible();
    await expect(section.getByText("0 of", { exact: false })).toBeVisible();
    await expect(section.getByText("Set up your company profile")).toBeVisible();
    await expect(section.getByText("Create your first client")).toBeVisible();
    await expect(section.getByText("Invite a teammate")).toBeVisible();

    // A brand-new organization: every step is genuinely Not Started.
    const notStartedBadges = section.getByText("Not Started", { exact: true });
    await expect(notStartedBadges.first()).toBeVisible();
    await expect(section.getByText("Complete", { exact: true })).toHaveCount(0);
  } finally {
    await cleanupOrg(org.id);
  }
});

test("a partially set-up organization shows a mix of Complete and Not Started step statuses", async ({ context, baseURL }) => {
  const org = await createOrg(`Onboarding Partial E2E ${randomUUID()}`);
  const owner = await dbQuery<{ id: string }>("user", "create", {
    data: { id: randomUUID(), name: "Onboarding E2E Owner", email: `${randomUUID()}@example.com` },
  });
  await dbQuery("client", "create", { data: { name: "E2E Onboarding Client", organizationId: org.id, userId: owner.id } });
  try {
    const page = await asAdmin(context, baseURL!);
    await page.goto(`/platform-admin/organizations/${org.id}`);

    const section = page.getByRole("region", { name: "Onboarding" });
    const clientRow = section.locator("li").filter({ hasText: "Create your first client" });
    await expect(clientRow.getByText("Complete", { exact: true })).toBeVisible();

    const paymentRow = section.locator("li").filter({ hasText: "Add payment receiving details" });
    await expect(paymentRow.getByText("Not Started", { exact: true })).toBeVisible();
  } finally {
    // Client.organizationId is onDelete: SetNull (not Cascade) — deleting
    // the Organization first would strand this Client row (still
    // referencing its owning User via onDelete: Restrict) and block the
    // User cleanup below. Delete the Client explicitly first.
    await dbQuery("client", "deleteMany", { where: { organizationId: org.id } });
    await cleanupOrg(org.id);
    await dbQuery("user", "deleteMany", { where: { id: owner.id } });
  }
});

test("the Onboarding section has no interactive button or link, and no tenant onboarding href is exposed", async ({ context, baseURL }) => {
  const org = await createOrg(`Onboarding NoLinks E2E ${randomUUID()}`);
  try {
    const page = await asAdmin(context, baseURL!);
    await page.goto(`/platform-admin/organizations/${org.id}`);

    const section = page.getByRole("region", { name: "Onboarding" });
    await expect(section).toBeVisible();
    await expect(section.getByRole("button")).toHaveCount(0);
    await expect(section.getByRole("link")).toHaveCount(0);

    const sectionHtml = await section.innerHTML();
    for (const forbiddenHref of ["/settings/company", "/settings/payment", "/settings/domain", "/settings/billing", "/clients/new", "/projects/new", "/tasks/new", "/team"]) {
      expect(sectionHtml).not.toContain(forbiddenHref);
    }
  } finally {
    await cleanupOrg(org.id);
  }
});

test("no horizontal overflow at a narrow viewport with the Onboarding section present", async ({ context, baseURL }) => {
  const org = await createOrg(`Onboarding Overflow E2E ${randomUUID()}`);
  try {
    const page = await asAdmin(context, baseURL!);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`/platform-admin/organizations/${org.id}`);

    await expect(page.getByRole("region", { name: "Onboarding" })).toBeVisible();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  } finally {
    await cleanupOrg(org.id);
  }
});
