import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getOrCreateOrganizationId, setActiveOrganization } from "@/lib/current-user";
import { updateThemeModeAction } from "@/app/(dashboard)/theme-actions";
import { setMockAuthUser, setMockThemeCookie, resetAuthMock, setMockActiveOrganization } from "../../support/auth-mock";
import { testEmail } from "../../support/run-id";

/**
 * Aqenra Theme Persistence Phase C2 — staff (`User.themeMode`) seeding
 * and persistence. `getOrCreateUser()` and `updateThemeModeAction()` both
 * run completely unmocked against the real (test) Postgres; only
 * `next/headers`'s `cookies()` and Supabase's `auth.getUser()` are mocked
 * (see test/integration/setup-mocks.ts) — the same "only the
 * request-context-bound APIs are mocked" discipline every other
 * integration test in this suite already follows.
 */

const createdUserIds: string[] = [];

function trackUser(id: string): string {
  createdUserIds.push(id);
  return id;
}

afterEach(async () => {
  resetAuthMock();
  if (createdUserIds.length > 0) {
    await prisma.membership.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

describe("Theme Persistence Phase C2 — staff signup/provisioning seed (getOrCreateUser)", () => {
  it("a brand-new User with an explicit dark.dark device cookie is seeded with themeMode DARK", async () => {
    const userId = trackUser(randomUUID());
    const email = testEmail("theme-seed-dark", "test.local");
    setMockAuthUser({ id: userId, email });
    setMockThemeCookie("dark.dark");

    const user = await getOrCreateUser();

    expect(user.themeMode).toBe("DARK");
    const persisted = await prisma.user.findUnique({ where: { id: userId } });
    expect(persisted?.themeMode).toBe("DARK");
  });

  it("a brand-new User with an automatic.dark cookie is seeded with themeMode AUTOMATIC — never the cached resolved half (DARK)", async () => {
    const userId = trackUser(randomUUID());
    setMockAuthUser({ id: userId, email: testEmail("theme-seed-automatic", "test.local") });
    setMockThemeCookie("automatic.dark");

    const user = await getOrCreateUser();

    expect(user.themeMode).toBe("AUTOMATIC");
  });

  it("a brand-new User with a malformed cookie is seeded with themeMode SYSTEM", async () => {
    const userId = trackUser(randomUUID());
    setMockAuthUser({ id: userId, email: testEmail("theme-seed-malformed", "test.local") });
    setMockThemeCookie("not-a-real-value");

    const user = await getOrCreateUser();

    expect(user.themeMode).toBe("SYSTEM");
  });

  it("a brand-new User with no cookie at all is seeded with themeMode SYSTEM", async () => {
    const userId = trackUser(randomUUID());
    setMockAuthUser({ id: userId, email: testEmail("theme-seed-none", "test.local") });
    // Deliberately no setMockThemeCookie() call.

    const user = await getOrCreateUser();

    expect(user.themeMode).toBe("SYSTEM");
  });

  it("an EXISTING User's stored preference is never overwritten by the device cookie on a later getOrCreateUser() call", async () => {
    const userId = trackUser(randomUUID());
    setMockAuthUser({ id: userId, email: testEmail("theme-existing", "test.local") });
    setMockThemeCookie("light.light");
    const created = await getOrCreateUser();
    expect(created.themeMode).toBe("LIGHT");

    // Same identity returns later with a completely different device
    // cookie (e.g. a different browser, or the same one after switching
    // locally) — the already-existing row must not be touched.
    setMockThemeCookie("dark.dark");
    const fetchedAgain = await getOrCreateUser();

    expect(fetchedAgain.themeMode).toBe("LIGHT");
    const persisted = await prisma.user.findUnique({ where: { id: userId } });
    expect(persisted?.themeMode).toBe("LIGHT");
  });
});

describe("Theme Persistence Phase C2 — staff persistence Server Action (updateThemeModeAction)", () => {
  it("updates only the calling identity's own User.themeMode", async () => {
    const userId = trackUser(randomUUID());
    setMockAuthUser({ id: userId, email: testEmail("theme-action-self", "test.local") });
    setMockThemeCookie("system.light");
    await getOrCreateUser(); // establish the row first, themeMode = SYSTEM

    await updateThemeModeAction("dark");

    const persisted = await prisma.user.findUnique({ where: { id: userId } });
    expect(persisted?.themeMode).toBe("DARK");
  });

  it("never touches another User's themeMode", async () => {
    const userIdA = trackUser(randomUUID());
    const userIdB = trackUser(randomUUID());
    setMockAuthUser({ id: userIdA, email: testEmail("theme-action-a", "test.local") });
    await getOrCreateUser();
    setMockAuthUser({ id: userIdB, email: testEmail("theme-action-b", "test.local") });
    await getOrCreateUser();

    setMockAuthUser({ id: userIdA, email: testEmail("theme-action-a", "test.local") });
    await updateThemeModeAction("dark");

    const a = await prisma.user.findUnique({ where: { id: userIdA } });
    const b = await prisma.user.findUnique({ where: { id: userIdB } });
    expect(a?.themeMode).toBe("DARK");
    expect(b?.themeMode).toBe("SYSTEM");
  });

  it("rejects an invalid mode string and writes nothing", async () => {
    const userId = trackUser(randomUUID());
    setMockAuthUser({ id: userId, email: testEmail("theme-action-invalid", "test.local") });
    await getOrCreateUser();

    // @ts-expect-error — deliberately calling with a value outside the ThemeMode union, proving runtime rejection of a forged/invalid string.
    await expect(updateThemeModeAction("purple")).rejects.toThrow("Invalid theme mode.");

    const persisted = await prisma.user.findUnique({ where: { id: userId } });
    expect(persisted?.themeMode).toBe("SYSTEM");
  });

  it("organization switching never alters themeMode — it lives on User, not Membership/Organization", async () => {
    const userId = trackUser(randomUUID());
    setMockAuthUser({ id: userId, email: testEmail("theme-org-switch", "test.local") });
    setMockThemeCookie("dark.dark");
    await getOrCreateUser();
    await updateThemeModeAction("dark");

    const orgAId = await getOrCreateOrganizationId({ id: userId, email: testEmail("theme-org-switch", "test.local"), name: "Theme Org Switch" }, "Org A");
    const orgBId = await prisma.organization
      .create({ data: { name: "Theme Org Switch B", slug: `theme-org-switch-b-${userId.slice(0, 8)}` } })
      .then((org) => org.id);
    await prisma.membership.create({ data: { userId, organizationId: orgBId, role: "MEMBER" } });

    setMockActiveOrganization(orgAId);
    await setActiveOrganization(orgAId);
    let persisted = await prisma.user.findUnique({ where: { id: userId } });
    expect(persisted?.themeMode).toBe("DARK");

    setMockActiveOrganization(orgBId);
    await setActiveOrganization(orgBId);
    persisted = await prisma.user.findUnique({ where: { id: userId } });
    expect(persisted?.themeMode).toBe("DARK");

    await prisma.membership.deleteMany({ where: { userId } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  });
});
