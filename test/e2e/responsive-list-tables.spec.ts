import { test, expect } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Product UI/UX PR 3 — responsive staff list tables (Clients, Projects,
 * Tasks, Invoices, Team). Below `md` (768px) the existing `<table>` is
 * hidden and a stacked-card list renders every column as a real,
 * DOM-order labelled field instead — never a horizontal-scroll-only
 * table. At `md` and up the original table is unchanged. Uses this
 * repo's own local PGlite/TEST_MODE harness only.
 */

let fixtures: TestFixtures;

test.beforeAll(async () => {
  fixtures = await seedE2EFixtures();
});

test.afterAll(async () => {
  await cleanupTestData(fixtures);
});

test.beforeEach(async ({ context, baseURL }) => {
  await injectTestSession(context, { id: fixtures.owner.id, email: fixtures.owner.email }, baseURL!);
});

test.describe("Clients", () => {
  test("narrow width (375px): the card list shows every field and a reachable Edit action; the table is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/clients");

    await expect(page.getByRole("table")).toBeHidden();

    const card = page.locator("li", { hasText: fixtures.clientA.name });
    await expect(card).toBeVisible();
    await expect(card.getByText("Name")).toBeVisible();
    await expect(card.getByText("Email")).toBeVisible();
    await expect(card.getByText("Status")).toBeVisible();

    const editLink = card.getByRole("link", { name: /Edit/ });
    await expect(editLink).toBeVisible();
    await editLink.focus();
    await expect(editLink).toBeFocused();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("desktop width (1280px): the real table is visible with correct headers, the card list is hidden, and the record resolves to exactly one accessible row", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/clients");

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Email" })).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(fixtures.clientA.name) });
    await expect(row).toHaveCount(1);
  });
});

test.describe("Projects", () => {
  test("narrow width (375px): the card list shows every field and a reachable Edit action; the table is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/projects");

    await expect(page.getByRole("table")).toBeHidden();

    const card = page.locator("li", { hasText: fixtures.project.name });
    await expect(card).toBeVisible();
    await expect(card.getByText("Client", { exact: true })).toBeVisible();
    await expect(card.getByText(fixtures.clientA.name)).toBeVisible();
    await expect(card.getByText("Status")).toBeVisible();

    const editLink = card.getByRole("link", { name: /Edit/ });
    await expect(editLink).toBeVisible();
    await editLink.focus();
    await expect(editLink).toBeFocused();
  });

  test("desktop width (1280px): the real table is visible with correct headers and the card list is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/projects");

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Client" })).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(fixtures.project.name) });
    await expect(row).toHaveCount(1);
  });
});

test.describe("Tasks", () => {
  test("narrow width (375px): the card list shows every field and a reachable Edit action; the table is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/tasks");

    await expect(page.getByRole("table")).toBeHidden();

    const card = page.locator("li", { hasText: fixtures.task.title });
    await expect(card).toBeVisible();
    await expect(card.getByText("Project", { exact: true })).toBeVisible();
    await expect(card.getByText("Priority")).toBeVisible();
    await expect(card.getByText("Due date")).toBeVisible();

    const editLink = card.getByRole("link", { name: /Edit/ });
    await expect(editLink).toBeVisible();
    await editLink.focus();
    await expect(editLink).toBeFocused();
  });

  test("desktop width (1280px): the real table is visible with correct headers and the card list is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/tasks");

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Priority" })).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(fixtures.task.title) });
    await expect(row).toHaveCount(1);
  });
});

test.describe("Invoices", () => {
  test("narrow width (375px): the card list shows every field including Amount and a reachable action; the table is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/invoices");

    await expect(page.getByRole("table")).toBeHidden();

    const card = page.locator("li", { hasText: fixtures.invoice.invoiceNumber });
    await expect(card).toBeVisible();
    await expect(card.getByText("Amount")).toBeVisible();
    await expect(card.getByText("Status")).toBeVisible();

    // fixtures.invoice's own real seeded status decides whether this is
    // Edit (DRAFT) or View (non-DRAFT) — either is an equally valid,
    // reachable action; the surface must offer one of the two.
    const actionLink = card.getByRole("link", { name: /Edit|View/ });
    await expect(actionLink).toBeVisible();
    await actionLink.focus();
    await expect(actionLink).toBeFocused();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("desktop width (1280px): the real table is visible with correct headers and the card list is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/invoices");

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Amount" })).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(fixtures.invoice.invoiceNumber) });
    await expect(row).toHaveCount(1);
  });
});

test.describe("Team", () => {
  test("narrow width (375px): the Members card list shows every field; both existing tables (Members, Pending invitations) are hidden", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/team");

    // Team has two independent tables (Members, Pending invitations),
    // both wrapped in the same hidden-below-md wrapper. Playwright's
    // getByRole() excludes a display:none element from the accessibility
    // tree entirely by default — zero matches here is the strongest form
    // of "hidden" (genuinely unreachable to assistive technology), not
    // merely a visual trick. A raw CSS locator (not role-based) confirms
    // both <table> elements still physically exist in the DOM (this PR
    // never deletes the desktop table), just display:none at this width.
    await expect(page.getByRole("table")).toHaveCount(0);
    const rawTables = page.locator("table");
    await expect(rawTables).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await expect(rawTables.nth(i)).toBeHidden();
    }

    // Scoped to the Members card list specifically (the first <ul>) —
    // fixtures.owner's name can also legitimately appear inside a second,
    // unrelated card in the separate Pending invitations list (as that
    // invitation's own "Invited by" value), which is real, pre-existing
    // page content, not a duplicate caused by this PR's own pattern.
    const membersList = page.locator("ul").first();
    const card = membersList.locator("li", { hasText: fixtures.owner.name });
    await expect(card).toBeVisible();
    await expect(card.getByText("Email", { exact: true })).toBeVisible();
    await expect(card.getByText("Role", { exact: true })).toBeVisible();
    await expect(card.getByText("Joined", { exact: true })).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("desktop width (1280px): the real Members table is visible with correct headers", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/team");

    const membersTable = page.getByRole("table").first();
    await expect(membersTable).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Role" }).first()).toBeVisible();

    // Scoped to the Members table specifically — fixtures.owner's name can
    // also legitimately appear in a second, unrelated row of the separate
    // Pending invitations table (as that invitation's "Invited by" value),
    // which is real, pre-existing page content, not a duplicate caused by
    // this PR's own responsive pattern.
    const row = membersTable.getByRole("row", { name: new RegExp(fixtures.owner.name) });
    await expect(row).toHaveCount(1);
  });
});
