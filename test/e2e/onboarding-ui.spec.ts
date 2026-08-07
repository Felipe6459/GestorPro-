import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, dbQuery, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";
import { testEmail, testSlug } from "../support/run-id";
import { TEST_EMAIL_DOMAIN } from "../support/env";

/**
 * Onboarding Stage 3 — real-browser coverage for the Dashboard checklist
 * card (src/components/onboarding/*). Backend correctness (progress
 * computation, skip/dismiss access rules, org isolation, §12's "business
 * mutations never write to the onboarding table" invariant) is already
 * exhaustively covered in test/unit/onboarding-*.test.ts and
 * test/integration/onboarding/ — this file only covers what genuinely
 * needs a real browser: what actually renders per progress state, the
 * skip/dismiss buttons updating the UI without a manual reload, keyboard
 * reachability, mobile layout, and Client Portal absence (Stage 3 task
 * §19's own minimum list).
 */

async function setActiveOrg(context: BrowserContext, baseURL: string, organizationId: string): Promise<void> {
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

async function actAsMember(
  context: BrowserContext,
  baseURL: string,
  user: { id: string; email: string },
  organizationId: string,
): Promise<void> {
  await context.clearCookies();
  await injectTestSession(context, user, baseURL);
  await setActiveOrg(context, baseURL, organizationId);
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

type FreshOrg = { org: { id: string }; owner: { id: string; email: string } };

/** A brand-new organization with zero business data — real Client/Project/etc. rows would make a step COMPLETE by construction (§4), which the "empty progress"/skip/dismiss tests below need to rule out. */
async function createFreshOrg(runId: string, label: string): Promise<FreshOrg> {
  const org = await dbQuery<{ id: string }>("organization", "create", {
    data: { name: `Fresh ${label}`, slug: testSlug(`onboarding-${label}`, runId) },
  });
  const owner = await dbQuery<{ id: string; email: string }>("user", "create", {
    data: { id: randomUUID(), email: testEmail(`onboarding-${label}-owner`, TEST_EMAIL_DOMAIN, runId), name: "Owner" },
  });
  await dbQuery("membership", "create", { data: { userId: owner.id, organizationId: org.id, role: "OWNER" } });
  return { org, owner };
}

/** Organization delete cascades Membership and OrganizationOnboardingStep (both `onDelete: Cascade`); the User row is separate. */
async function cleanupFreshOrg({ org, owner }: FreshOrg): Promise<void> {
  await dbQuery("organization", "delete", { where: { id: org.id } });
  await dbQuery("user", "delete", { where: { id: owner.id } });
}

/** The card is a `<section aria-labelledby="onboarding-heading">` — an accessible "region" named after its own heading, so this scopes every row/count/progressbar assertion to the card alone, never any other list on /dashboard (Upcoming tasks, Overdue items, Recent invoices). */
function onboardingCard(page: Page) {
  return page.getByRole("region", { name: "Getting started" });
}

function rowFor(page: Page, label: string) {
  return onboardingCard(page).getByRole("listitem").filter({ hasText: label });
}

let fixtures: TestFixtures;

test.beforeAll(async () => {
  fixtures = await seedE2EFixtures();
});

test.afterAll(async () => {
  await cleanupTestData(fixtures);
});

test.describe("Visibility per progress state", () => {
  test("a fresh, empty organization shows the full checklist, 0 of 6 complete, Welcome first", async ({
    context,
    baseURL,
    page,
  }) => {
    const fresh = await createFreshOrg(fixtures.runId, "empty");
    await actAsMember(context, baseURL!, fresh.owner, fresh.org.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    await expect(onboardingCard(page)).toBeVisible();
    await expect(onboardingCard(page).getByText("0 of 6 complete")).toBeVisible();

    const bar = onboardingCard(page).getByRole("progressbar", { name: "Onboarding progress" });
    await expect(bar).toHaveAttribute("aria-valuenow", "0");

    const rows = onboardingCard(page).getByRole("listitem");
    await expect(rows).toHaveCount(8);
    await expect(rows.first()).toContainText("Welcome");

    await cleanupFreshOrg(fresh);
  });

  test("a partially-progressed organization shows a partial count and per-step statuses", async ({
    context,
    baseURL,
    page,
  }) => {
    await actAsMember(context, baseURL!, fixtures.orgBOwner, fixtures.orgB.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    await expect(onboardingCard(page)).toBeVisible();

    const clientRow = rowFor(page, "Create your first client");
    await expect(clientRow.getByText("Complete", { exact: true })).toBeVisible();

    const projectRow = rowFor(page, "Create your first project");
    await expect(projectRow.getByText("Not Started", { exact: true })).toBeVisible();
    await expect(projectRow.getByRole("link", { name: /Go to/ })).toBeVisible();
  });

  test("a fully productive organization (every substantive step already done) shows no checklist at all", async ({
    context,
    baseURL,
    page,
  }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await expect(onboardingCard(page)).toHaveCount(0);
  });
});

test.describe("Dependency-blocked and billing placeholder", () => {
  test("a step blocked behind an undone dependency shows the exact blocked reason, no Go-to link, but Skip remains offered", async ({
    context,
    baseURL,
    page,
  }) => {
    await actAsMember(context, baseURL!, fixtures.orgBOwner, fixtures.orgB.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    const taskRow = rowFor(page, "Create your first task");
    await expect(taskRow.getByText("Tasks must belong to a project. Add one before creating a task.")).toBeVisible();
    await expect(taskRow.getByRole("link", { name: /Go to/ })).toHaveCount(0);
    await expect(taskRow.getByRole("button", { name: /Skip/ })).toBeVisible();
  });

  test("the billing placeholder step shows Not Applicable with no button at all", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.orgBOwner, fixtures.orgB.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    const billingRow = rowFor(page, "Review billing");
    await expect(billingRow.getByText("Not Applicable", { exact: true })).toBeVisible();
    await expect(billingRow.getByRole("button")).toHaveCount(0);
    await expect(billingRow.getByRole("link")).toHaveCount(0);
  });
});

test.describe("Actions", () => {
  test("clicking 'Go to' navigates to the step's real route", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.orgBOwner, fixtures.orgB.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    const projectRow = rowFor(page, "Create your first project");
    await projectRow.getByRole("link", { name: /Go to/ }).click();
    await page.waitForURL(/\/projects\/new/);
  });

  test("skipping a step updates its row status in place — no manual reload, no navigation away from /dashboard", async ({
    context,
    baseURL,
    page,
  }) => {
    const fresh = await createFreshOrg(fixtures.runId, "skip");
    await actAsMember(context, baseURL!, fresh.owner, fresh.org.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    const teammateRow = rowFor(page, "Invite a teammate");
    await expect(teammateRow.getByText("Not Started", { exact: true })).toBeVisible();

    await teammateRow.getByRole("button", { name: /Skip/ }).click();

    await expect(teammateRow.getByText("Skipped", { exact: true })).toBeVisible();
    await expect(teammateRow.getByRole("button", { name: /Skip/ })).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);

    await cleanupFreshOrg(fresh);
  });

  test("dismissing the checklist hides the whole card in place — no manual reload", async ({
    context,
    baseURL,
    page,
  }) => {
    const fresh = await createFreshOrg(fixtures.runId, "dismiss");
    await actAsMember(context, baseURL!, fresh.owner, fresh.org.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    await expect(onboardingCard(page)).toBeVisible();
    await page.getByRole("button", { name: "Dismiss onboarding" }).click();

    await expect(onboardingCard(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);

    await cleanupFreshOrg(fresh);
  });
});

test.describe("Accessibility", () => {
  test("Skip is a real, keyboard-focusable, labeled button — Enter while focused performs the skip", async ({
    context,
    baseURL,
    page,
  }) => {
    const fresh = await createFreshOrg(fixtures.runId, "keyboard");
    await actAsMember(context, baseURL!, fresh.owner, fresh.org.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    const teammateRow = rowFor(page, "Invite a teammate");
    const skipButton = teammateRow.getByRole("button", { name: /Skip/ });
    await skipButton.focus();
    await expect(skipButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(teammateRow.getByText("Skipped", { exact: true })).toBeVisible();

    await cleanupFreshOrg(fresh);
  });

  test("the progress bar exposes role=progressbar with correct aria-value bounds", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.orgBOwner, fixtures.orgB.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    const bar = onboardingCard(page).getByRole("progressbar", { name: "Onboarding progress" });
    await expect(bar).toHaveAttribute("aria-valuemin", "0");
    await expect(bar).toHaveAttribute("aria-valuemax", "100");
    const valueNow = await bar.getAttribute("aria-valuenow");
    expect(Number(valueNow)).toBeGreaterThanOrEqual(0);
    expect(Number(valueNow)).toBeLessThanOrEqual(100);
  });

  test("Dismiss is a real, labeled button reachable by keyboard", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.orgBOwner, fixtures.orgB.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    const dismissButton = page.getByRole("button", { name: "Dismiss onboarding" });
    await dismissButton.focus();
    await expect(dismissButton).toBeFocused();
  });
});

test.describe("Mobile", () => {
  for (const width of [320, 375, 768, 1024]) {
    test(`the card itself collapses to fit ${width}px without its own horizontal overflow`, async ({
      context,
      baseURL,
      page,
    }) => {
      // Scoped to the card's own bounding box, not document.scrollWidth —
      // Header's email + sign-out row (out of scope, "Не меняй Header")
      // already overflows the viewport below ~360px regardless of
      // onboarding, so a whole-page overflow check would fail for a
      // pre-existing, unrelated reason. This isolates what Stage 3 §15
      // actually asks for: the card adapts its own layout at each
      // breakpoint, the same "one component reflows itself" convention
      // Sidebar already uses.
      await page.setViewportSize({ width, height: 800 });
      await actAsMember(context, baseURL!, fixtures.orgBOwner, fixtures.orgB.id);
      await gotoAndSettle(page, `${baseURL}/dashboard`);

      await expect(onboardingCard(page)).toBeVisible();
      const box = await onboardingCard(page).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(width + 1);

      // Every row's primary controls stay individually reachable (not
      // clipped/zero-size) at this width.
      const projectRow = rowFor(page, "Create your first project");
      await expect(projectRow.getByRole("link", { name: /Go to/ })).toBeVisible();
      const teammateRow = rowFor(page, "Invite a teammate");
      await expect(teammateRow.getByRole("button", { name: /Skip/ })).toBeVisible();
    });
  }
});

test.describe("Client Portal", () => {
  test("no onboarding checklist is reachable anywhere from the Client Portal", async ({ context, baseURL, page }) => {
    await injectTestSession(context, { id: fixtures.portalUser.id, email: fixtures.portalUser.email }, baseURL!);
    await gotoAndSettle(page, `${baseURL}/portal`);
    await expect(onboardingCard(page)).toHaveCount(0);
  });
});
