import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, dbQuery, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Global Search Stage 3 — real-browser coverage for what unit tests
 * structurally cannot exercise: the Cmd/Ctrl+K shortcut, the native
 * `<dialog>`'s own open/close/focus behavior, live debounced fetching
 * against the real `/api/search` route, keyboard/mouse navigation, and
 * organization-isolation as experienced through the actual UI. Every
 * backend edge case (ranking, per-type scoping, rate limiting, org
 * isolation at the query level) is already exhaustively covered in
 * test/unit/search-*.test.ts and test/integration/search/ — this file
 * deliberately does not repeat them, only what genuinely requires a real
 * browser.
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

function searchTrigger(page: Page) {
  return page.getByRole("button", { name: "Search (Cmd+K)" });
}

function searchInput(page: Page) {
  return page.getByRole("combobox", { name: "Search" });
}

async function openSearch(page: Page): Promise<void> {
  await searchTrigger(page).click();
  await expect(searchInput(page)).toBeFocused();
}

async function search(page: Page, query: string): Promise<void> {
  await openSearch(page);
  await searchInput(page).fill(query);
}

let fixtures: TestFixtures;

test.beforeAll(async () => {
  fixtures = await seedE2EFixtures();
});

test.afterEach(async () => {
  await dbQuery("commentMention", "deleteMany", {});
  await dbQuery("comment", "deleteMany", { where: { organizationId: { in: [fixtures.orgA.id, fixtures.orgB.id] } } });
  await dbQuery("client", "deleteMany", { where: { name: { startsWith: "SEARCH-E2E-" } } });
});

test.afterAll(async () => {
  await cleanupTestData(fixtures);
});

test.describe("Open / close", () => {
  test("clicking the trigger opens the dialog with the input focused", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await openSearch(page);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("Ctrl+K opens the dialog", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await page.keyboard.press("Control+k");
    await expect(searchInput(page)).toBeFocused();
  });

  test("Escape closes the dialog", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await openSearch(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("focus returns to the trigger button after closing", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await openSearch(page);
    await page.keyboard.press("Escape");
    await expect(searchTrigger(page)).toBeFocused();
  });

  test("repeated Ctrl+K while open closes it (toggle)", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Ctrl+K is ignored while typing in an unrelated input on the page", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/clients/new`);
    // "Company" (not "Name") deliberately: the Name field's label carries
    // a visually-hidden required-marker span, which makes its computed
    // accessible name "Name*" rather than a clean "Name" — irrelevant to
    // what this test is actually checking, so a field with no such marker
    // avoids that ambiguity entirely.
    await page.getByLabel("Company", { exact: true }).click();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("Search — per entity type", () => {
  test("finds a Client by name", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, fixtures.clientA.name);
    const group = page.getByRole("group", { name: "Clients" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("option", { name: new RegExp(fixtures.clientA.name) })).toBeVisible();
  });

  test("finds a Project by name", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, fixtures.project.name);
    const group = page.getByRole("group", { name: "Projects" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("option", { name: new RegExp(fixtures.project.name) })).toBeVisible();
  });

  test("finds a Task by title", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, fixtures.task.title);
    const group = page.getByRole("group", { name: "Tasks" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("option", { name: new RegExp(fixtures.task.title) })).toBeVisible();
  });

  test("finds an Invoice by number", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, fixtures.invoice.invoiceNumber);
    const group = page.getByRole("group", { name: "Invoices" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("option", { name: new RegExp(fixtures.invoice.invoiceNumber) })).toBeVisible();
  });

  test("finds a Comment by body content, with a bounded preview (never the full body) and no raw mention token/ids", async ({
    context,
    baseURL,
    page,
  }) => {
    const longBody = "SEARCH-E2E-COMMENT " + "filler text ".repeat(30) + "the important tail";
    const comment = await dbQuery<{ id: string }>("comment", "create", {
      data: {
        organizationId: fixtures.orgA.id,
        authorId: fixtures.owner.id,
        entityType: "PROJECT",
        entityId: fixtures.project.id,
        body: longBody,
      },
    });

    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, "SEARCH-E2E-COMMENT");

    await expect(page.getByRole("group", { name: "Comments" })).toBeVisible();
    const option = page.getByRole("option").filter({ hasText: "SEARCH-E2E-COMMENT" });
    await expect(option).toBeVisible();

    const optionText = await option.innerText();
    expect(optionText).not.toBe(longBody);
    expect(optionText.length).toBeLessThan(longBody.length);
    expect(optionText).not.toContain(comment.id);
    expect(optionText).not.toContain(fixtures.owner.id);
  });
});

test.describe("Navigation", () => {
  test("ArrowDown moves the active result, and Enter navigates to it", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    // "Test" matches both the Client ("Test Client A", prefix) and the
    // Project ("Test Project", prefix). Groups render in the fixed
    // CLIENT-then-PROJECT order, so the flattened list's index 0 is the
    // Client (auto-highlighted on arrival) and index 1 is the Project —
    // pressing ArrowDown once deterministically moves onto the Project,
    // which this test then confirms Enter actually navigates to.
    await search(page, "Test");
    const clientGroup = page.getByRole("group", { name: "Clients" });
    const projectGroup = page.getByRole("group", { name: "Projects" });
    await expect(clientGroup.getByRole("option", { name: new RegExp(fixtures.clientA.name) })).toBeVisible();
    await expect(projectGroup.getByRole("option", { name: new RegExp(fixtures.project.name) })).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForURL(new RegExp(`/projects/${fixtures.project.id}/edit`));
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("a mouse click on a result navigates to it", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, fixtures.project.name);
    const projectGroup = page.getByRole("group", { name: "Projects" });
    await projectGroup.getByRole("option", { name: new RegExp(fixtures.project.name) }).click();
    await page.waitForURL(new RegExp(`/projects/${fixtures.project.id}/edit`));
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("selecting a Comment result lands on the exact #comment-{id} anchor", async ({ context, baseURL, page }) => {
    const comment = await dbQuery<{ id: string }>("comment", "create", {
      data: {
        organizationId: fixtures.orgA.id,
        authorId: fixtures.owner.id,
        entityType: "TASK",
        entityId: fixtures.task.id,
        body: "SEARCH-E2E-DEEPLINK unique comment body",
      },
    });

    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, "SEARCH-E2E-DEEPLINK");
    await page.getByRole("option").filter({ hasText: "SEARCH-E2E-DEEPLINK" }).click();

    await page.waitForURL(new RegExp(`/tasks/${fixtures.task.id}/edit#comment-${comment.id}`));
    await expect(page.locator(`#comment-${comment.id}`)).toBeVisible();
  });
});

test.describe("States", () => {
  test("a query below the minimum length never triggers a network request", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    let requestCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/search")) requestCount += 1;
    });

    await openSearch(page);
    await searchInput(page).fill("a");
    await page.waitForTimeout(500); // longer than the 250ms debounce, to prove no request ever fires
    expect(requestCount).toBe(0);
  });

  test("loading state shows a spinner while a request is in flight, without losing the previous results", async ({
    context,
    baseURL,
    page,
  }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    await search(page, fixtures.clientA.name);
    const clientGroup = page.getByRole("group", { name: "Clients" });
    await expect(clientGroup.getByRole("option", { name: new RegExp(fixtures.clientA.name) })).toBeVisible();

    // Delay the *next* response so the loading state has time to actually
    // render and be asserted on, rather than racing a fast local response.
    await page.route("**/api/search**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });

    await searchInput(page).press("End");
    await searchInput(page).pressSequentially("x");

    // The visible loading indicator is the spinner swapped in for the
    // search icon (search-input.tsx) — the aria-live status text
    // deliberately does NOT flip to "Searching…" while a previous result
    // set is still cached (see search-results.tsx: showing the old
    // results takes priority over a transient loading announcement,
    // exactly the "previous stays visible" behavior this test is also
    // checking).
    await expect(page.locator("svg.animate-spin")).toBeVisible({ timeout: 5000 });
    // The previous result is still visible underneath the loading spinner.
    await expect(clientGroup.getByRole("option", { name: new RegExp(fixtures.clientA.name) })).toBeVisible();

    await page.unroute("**/api/search**");
  });

  test("no results shows the exact 'No results found.' message", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, "zzz-definitely-no-match-zzz");
    await expect(page.getByText("No results found.").first()).toBeVisible();
  });

  test("a stubbed 429 response shows the generic rate-limit message", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    await page.route("**/api/search**", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Too many requests. Please try again later." }),
      }),
    );

    await search(page, "anything");
    await expect(page.getByText("Too many requests. Please try again later.").first()).toBeVisible();
    await page.unroute("**/api/search**");
  });

  test("a stubbed 500 response shows a generic error, never the raw backend message", async ({
    context,
    baseURL,
    page,
  }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    await page.route("**/api/search**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "PrismaClientKnownRequestError: raw stack trace leak" }),
      }),
    );

    await search(page, "anything");
    await expect(page.getByText("Something went wrong. Please try again.").first()).toBeVisible();
    await expect(page.getByText(/PrismaClientKnownRequestError/)).toHaveCount(0);
    await page.unroute("**/api/search**");
  });
});

test.describe("Security / isolation", () => {
  test("org A's data is never visible while searching from an org B session", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.orgBOwner, fixtures.orgB.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, fixtures.clientA.name);
    await expect(page.getByText("No results found.").first()).toBeVisible();
    await expect(page.getByText(fixtures.clientA.name)).toHaveCount(0);
  });

  test("switching the active organization clears any stale results", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, fixtures.clientA.name);
    const clientGroup = page.getByRole("group", { name: "Clients" });
    await expect(clientGroup.getByRole("option", { name: new RegExp(fixtures.clientA.name) })).toBeVisible();
    await page.keyboard.press("Escape");

    // Simulate a real organization switch: the actual OrganizationSwitcher
    // writes this same cookie and redirects, which fully reloads (and
    // therefore remounts) the Header — this reproduces exactly that end
    // state without depending on a second, unrelated org existing to
    // switch to via the real UI control.
    await setActiveOrg(context, baseURL!, fixtures.orgB.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);

    await openSearch(page);
    await expect(searchInput(page)).toHaveValue("");
    await expect(page.getByRole("option")).toHaveCount(0);
  });

  test("a Client Portal identity has no search trigger anywhere in the portal", async ({ context, baseURL, page }) => {
    await injectTestSession(context, { id: fixtures.portalUser.id, email: fixtures.portalUser.email }, baseURL!);
    await gotoAndSettle(page, `${baseURL}/portal`);
    await expect(searchTrigger(page)).toHaveCount(0);
  });

  test("an XSS-shaped Client name renders as literal text and never executes", async ({ context, baseURL, page }) => {
    const client = await dbQuery<{ id: string }>("client", "create", {
      data: {
        name: "SEARCH-E2E-<script>alert(1)</script>",
        organizationId: fixtures.orgA.id,
        userId: fixtures.owner.id,
      },
    });

    let dialogFired = false;
    page.once("dialog", (dialog) => {
      dialogFired = true;
      void dialog.dismiss();
    });

    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, "SEARCH-E2E-<script>");

    await expect(page.getByText("SEARCH-E2E-<script>alert(1)</script>")).toBeVisible();
    expect(dialogFired).toBe(false);

    await dbQuery("client", "delete", { where: { id: client.id } });
  });

  test("a query containing LIKE-metacharacters (%, _) works without erroring", async ({ context, baseURL, page }) => {
    const client = await dbQuery<{ id: string }>("client", "create", {
      data: { name: "SEARCH-E2E-50% Off", organizationId: fixtures.orgA.id, userId: fixtures.owner.id },
    });

    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await search(page, "SEARCH-E2E-50%");
    await expect(page.getByRole("option", { name: /SEARCH-E2E-50%/ })).toBeVisible();

    await dbQuery("client", "delete", { where: { id: client.id } });
  });
});

test.describe("Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("the trigger is reachable and the dialog is usable on a small viewport", async ({ context, baseURL, page }) => {
    await actAsMember(context, baseURL!, fixtures.owner, fixtures.orgA.id);
    await gotoAndSettle(page, `${baseURL}/dashboard`);
    await openSearch(page);
    await searchInput(page).fill(fixtures.project.name);
    const projectGroup = page.getByRole("group", { name: "Projects" });
    await expect(projectGroup.getByRole("option", { name: new RegExp(fixtures.project.name) })).toBeVisible();
  });
});
