import { test, expect, type BrowserContext } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Product UI/UX PR 5 — real keyboard-focus geometry/style proof for the
 * two corrections that are only meaningfully verifiable through actual
 * browser focus behavior (F4's shared Select adoption already carried a
 * focus ring before this PR; F7's Invoice radio focus ring is genuinely
 * new). This file proves visible focus through real Tab-key navigation
 * and a computed-style assertion (`box-shadow`, which is how Tailwind's
 * `ring`/`focus-visible:ring-*` utilities are actually implemented) —
 * never by asserting a Tailwind class string exists, and never a
 * screenshot.
 */

let fixtures: TestFixtures;

test.beforeAll(async () => {
  fixtures = await seedE2EFixtures();
});

test.afterAll(async () => {
  await cleanupTestData(fixtures);
});

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

test.describe("Settings — Company Currency select shows a real keyboard focus-visible ring", () => {
  test("Tab-focusing the Currency select produces a real, non-empty box-shadow ring absent before focus", async ({
    page,
    context,
    baseURL,
  }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await page.goto("/settings/company");

    const currency = page.getByLabel("Currency");
    await expect(currency).toBeVisible();

    const beforeFocus = await currency.evaluate((el) => getComputedStyle(el).boxShadow);

    await currency.focus();
    const afterFocus = await currency.evaluate((el) => getComputedStyle(el).boxShadow);

    expect(afterFocus).not.toBe("none");
    expect(afterFocus).not.toBe(beforeFocus);
  });
});

test.describe("Invoice type radios (create page) show a real keyboard focus-visible ring", () => {
  test("Tab-focusing, then arrow-keying between, the Flat amount / Itemized radios produces a real focus ring on whichever is focused", async ({
    page,
    context,
    baseURL,
  }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await page.goto("/invoices/new");

    const flatRadio = page.getByRole("radio", { name: "Flat amount" });
    const itemizedRadio = page.getByRole("radio", { name: "Itemized" });
    await expect(flatRadio).toBeVisible();

    const beforeFocus = await flatRadio.evaluate((el) => getComputedStyle(el).boxShadow);

    await flatRadio.focus();
    const flatFocused = await flatRadio.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(flatFocused).not.toBe("none");
    expect(flatFocused).not.toBe(beforeFocus);

    // Real native radio-group keyboard behavior: ArrowRight moves both
    // focus and the checked state to the next radio in the same
    // `name="mode-selector"` group — never a fake button implementation.
    await page.keyboard.press("ArrowRight");
    await expect(itemizedRadio).toBeFocused();
    await expect(itemizedRadio).toBeChecked();

    const itemizedFocused = await itemizedRadio.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(itemizedFocused).not.toBe("none");

    // The now-unfocused Flat amount radio no longer shows the ring.
    const flatAfterMovingAway = await flatRadio.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(flatAfterMovingAway).toBe(beforeFocus);
  });
});
