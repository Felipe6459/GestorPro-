import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { dbQuery } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Platform Admin Users Explorer, PR 1 — staff `User` list only (never
 * `PortalUser`), replacing the previous placeholder shell. Every test
 * creates its own uniquely-marked users (a random marker embedded in
 * name/email/org name) and searches for exactly that marker via `?q=`,
 * so assertions are never polluted by whatever else the shared test
 * database happens to contain.
 */

const PLATFORM_ADMIN_EMAIL = "platform-admin-e2e@example.com";
const BASE_PATH = "/platform-admin/users";

async function asAdmin(context: BrowserContext, baseURL: string): Promise<Page> {
  await injectTestSession(context, { id: `e2e-users-explorer-${randomUUID()}`, email: PLATFORM_ADMIN_EMAIL }, baseURL);
  return context.newPage();
}

async function createUser(overrides: { name: string; email: string; createdAt?: string }): Promise<{ id: string }> {
  return dbQuery<{ id: string }>("user", "create", {
    data: { id: randomUUID(), name: overrides.name, email: overrides.email, createdAt: overrides.createdAt },
  });
}

async function createOrg(name: string): Promise<{ id: string }> {
  return dbQuery<{ id: string }>("organization", "create", {
    data: { name, slug: `e2e-users-explorer-${randomUUID()}` },
  });
}

async function addMembership(userId: string, organizationId: string, role: "OWNER" | "ADMIN" | "MEMBER") {
  await dbQuery("membership", "create", { data: { userId, organizationId, role } });
}

async function cleanup(ids: { userIds?: string[]; orgIds?: string[] }) {
  if (ids.userIds?.length) await dbQuery("user", "deleteMany", { where: { id: { in: ids.userIds } } });
  if (ids.orgIds?.length) await dbQuery("organization", "deleteMany", { where: { id: { in: ids.orgIds } } });
}

test("the real Users list renders a user with no memberships, showing the safe fallback", async ({ context, baseURL }) => {
  const marker = `usersexplorer-${randomUUID()}`;
  const user = await createUser({ name: `${marker} Solo User`, email: `${marker}@example.com` });
  try {
    const page = await asAdmin(context, baseURL!);
    await page.goto(`${BASE_PATH}?q=${encodeURIComponent(marker)}`);

    await expect(page.getByRole("cell", { name: `${marker} Solo User` })).toBeVisible();
    await expect(page.getByText(`${marker}@example.com`)).toBeVisible();
    await expect(page.getByText("No organizations")).toBeVisible();
  } finally {
    await cleanup({ userIds: [user.id] });
  }
});

test("search narrows results to matching name/email only", async ({ context, baseURL }) => {
  const marker = `usersexplorer-${randomUUID()}`;
  const matching = await createUser({ name: `${marker} Match`, email: `${randomUUID()}@example.com` });
  const nonMatching = await createUser({ name: "Someone Else Entirely", email: `${randomUUID()}@example.com` });
  try {
    const page = await asAdmin(context, baseURL!);
    await page.goto(`${BASE_PATH}?q=${encodeURIComponent(marker)}`);

    await expect(page.getByText(`${marker} Match`)).toBeVisible();
    await expect(page.getByText("Someone Else Entirely")).toHaveCount(0);
  } finally {
    await cleanup({ userIds: [matching.id, nonMatching.id] });
  }
});

test("Name (A–Z) sort orders alphabetically", async ({ context, baseURL }) => {
  const marker = `usersexplorer-${randomUUID()}`;
  const zed = await createUser({ name: `${marker}-Zed`, email: `${randomUUID()}@example.com` });
  const amy = await createUser({ name: `${marker}-Amy`, email: `${randomUUID()}@example.com` });
  try {
    const page = await asAdmin(context, baseURL!);
    await page.goto(`${BASE_PATH}?q=${encodeURIComponent(marker)}&sort=name:asc`);

    const names = await page.locator("tbody tr td:first-child").allInnerTexts();
    expect(names).toEqual([`${marker}-Amy`, `${marker}-Zed`]);
  } finally {
    await cleanup({ userIds: [zed.id, amy.id] });
  }
});

test("pagination: crossing the page-size boundary shows Next/Previous correctly and splits rows across pages", async ({
  context,
  baseURL,
}) => {
  const marker = `usersexplorer-${randomUUID()}`;
  const created: { id: string }[] = [];
  try {
    for (let i = 0; i < 13; i++) {
      created.push(
        await createUser({
          name: `${marker}-${String(i).padStart(2, "0")}`,
          email: `${randomUUID()}@example.com`,
          createdAt: new Date(2021, 0, i + 1).toISOString(),
        }),
      );
    }

    const page = await asAdmin(context, baseURL!);
    await page.goto(`${BASE_PATH}?q=${encodeURIComponent(marker)}&sort=createdAt:asc`);
    await expect(page.locator("tbody tr")).toHaveCount(10);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(page.getByRole("link", { name: "Next" })).toBeVisible();

    await page.getByRole("link", { name: "Next" }).click();
    await page.waitForURL(/page=2/);
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Previous" })).toBeVisible();
  } finally {
    await cleanup({ userIds: created.map((u) => u.id) });
  }
});

test("a multi-org user shows every membership as its own organization + role pair, correctly paired", async ({ context, baseURL }) => {
  const marker = `usersexplorer-${randomUUID()}`;
  const orgA = await createOrg(`${marker}-OrgA`);
  const orgB = await createOrg(`${marker}-OrgB`);
  const user = await createUser({ name: `${marker}-MultiOrgUser`, email: `${randomUUID()}@example.com` });
  await addMembership(user.id, orgA.id, "ADMIN");
  await addMembership(user.id, orgB.id, "MEMBER");
  try {
    const page = await asAdmin(context, baseURL!);
    await page.goto(`${BASE_PATH}?q=${encodeURIComponent(marker)}`);

    const row = page.locator("tbody tr").filter({ hasText: `${marker}-MultiOrgUser` });
    await expect(row.getByRole("link", { name: `${marker}-OrgA` })).toBeVisible();
    await expect(row.getByRole("link", { name: `${marker}-OrgB` })).toBeVisible();
    await expect(row.getByText("Admin", { exact: true })).toBeVisible();
    await expect(row.getByText("Member", { exact: true })).toBeVisible();
  } finally {
    await cleanup({ userIds: [user.id], orgIds: [orgA.id, orgB.id] });
  }
});

test("an organization link leads to the existing Organization Detail page", async ({ context, baseURL }) => {
  const marker = `usersexplorer-${randomUUID()}`;
  const org = await createOrg(`${marker}-Org`);
  const user = await createUser({ name: `${marker}-User`, email: `${randomUUID()}@example.com` });
  await addMembership(user.id, org.id, "OWNER");
  try {
    const page = await asAdmin(context, baseURL!);
    await page.goto(`${BASE_PATH}?q=${encodeURIComponent(marker)}`);
    await page.getByRole("link", { name: `${marker}-Org` }).click();
    await expect(page).toHaveURL(new RegExp(`/platform-admin/organizations/${org.id}$`));
  } finally {
    await cleanup({ userIds: [user.id], orgIds: [org.id] });
  }
});

test("a search term matching nothing shows the empty search-result state", async ({ context, baseURL }) => {
  const page = await asAdmin(context, baseURL!);
  await page.goto(`${BASE_PATH}?q=${encodeURIComponent("zzz-definitely-no-such-user-zzz")}`);
  await expect(page.getByText("No matching users")).toBeVisible();
  await expect(page.getByText(/No users match "zzz-definitely-no-such-user-zzz"/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear search" })).toBeVisible();
});

test("a long unbroken name and email wrap safely with no horizontal overflow at a narrow viewport", async ({ context, baseURL }) => {
  const marker = `usersexplorer-${randomUUID()}`;
  const longName = `${marker}${"X".repeat(120)}`;
  const longEmail = `${"y".repeat(120)}@example.com`;
  const user = await createUser({ name: longName, email: longEmail });
  try {
    const page = await asAdmin(context, baseURL!);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${BASE_PATH}?q=${encodeURIComponent(marker)}`);

    await expect(page.getByText(longName)).toBeVisible();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  } finally {
    await cleanup({ userIds: [user.id] });
  }
});
