import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { acceptClientInvitationAction } from "@/app/portal/invite/[token]/actions";
import { updatePortalThemeModeAction } from "@/app/portal/(app)/theme-actions";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { setMockAuthUser, setMockThemeCookie, resetAuthMock } from "../../support/auth-mock";
import { RedirectSignal, resetNavigationMock } from "../../support/navigation-mock";
import { testEmail } from "../../support/run-id";
import { TEST_EMAIL_DOMAIN } from "../../support/env";

/**
 * Aqenra Theme Persistence Phase C2 — Portal (`PortalUser.themeMode`)
 * seeding and persistence. Mirrors
 * test/integration/auth/theme-mode-persistence.test.ts's staff coverage
 * exactly, using the real `acceptClientInvitationAction` — the one true
 * PortalUser-creation site — rather than a synthetic upsert.
 */

async function createPendingInvitation(clientId: string, ownerUserId: string, email: string) {
  return prisma.clientInvitation.create({
    data: {
      clientId,
      email,
      token: randomUUID(),
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedById: ownerUserId,
    },
  });
}

describe("Theme Persistence Phase C2 — Portal invitation acceptance seed (acceptClientInvitationAction)", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterEach(() => {
    resetAuthMock();
    resetNavigationMock();
  });

  afterAll(async () => {
    await cleanupTestData(fixtures);
  });

  it("a brand-new PortalUser with an explicit dark.dark device cookie is seeded with themeMode DARK", async () => {
    const email = testEmail("portal-theme-seed-dark", TEST_EMAIL_DOMAIN, fixtures.runId);
    const authUserId = randomUUID();
    const invitation = await createPendingInvitation(fixtures.clientA.id, fixtures.owner.id, email);
    setMockAuthUser({ id: authUserId, email });
    setMockThemeCookie("dark.dark");

    await expect(acceptClientInvitationAction(invitation.token)).rejects.toBeInstanceOf(RedirectSignal);

    const portalUser = await prisma.portalUser.findUnique({ where: { id: authUserId } });
    expect(portalUser?.themeMode).toBe("DARK");

    await prisma.portalUser.delete({ where: { id: authUserId } });
  });

  it("automatic.light is seeded as themeMode AUTOMATIC — never the cached resolved half (LIGHT)", async () => {
    const email = testEmail("portal-theme-seed-automatic", TEST_EMAIL_DOMAIN, fixtures.runId);
    const authUserId = randomUUID();
    const invitation = await createPendingInvitation(fixtures.clientA.id, fixtures.owner.id, email);
    setMockAuthUser({ id: authUserId, email });
    setMockThemeCookie("automatic.light");

    await expect(acceptClientInvitationAction(invitation.token)).rejects.toBeInstanceOf(RedirectSignal);

    const portalUser = await prisma.portalUser.findUnique({ where: { id: authUserId } });
    expect(portalUser?.themeMode).toBe("AUTOMATIC");

    await prisma.portalUser.delete({ where: { id: authUserId } });
  });

  it("malformed/missing cookie is seeded as themeMode SYSTEM", async () => {
    const email = testEmail("portal-theme-seed-malformed", TEST_EMAIL_DOMAIN, fixtures.runId);
    const authUserId = randomUUID();
    const invitation = await createPendingInvitation(fixtures.clientA.id, fixtures.owner.id, email);
    setMockAuthUser({ id: authUserId, email });
    // Deliberately no setMockThemeCookie() call.

    await expect(acceptClientInvitationAction(invitation.token)).rejects.toBeInstanceOf(RedirectSignal);

    const portalUser = await prisma.portalUser.findUnique({ where: { id: authUserId } });
    expect(portalUser?.themeMode).toBe("SYSTEM");

    await prisma.portalUser.delete({ where: { id: authUserId } });
  });

  it("an EXISTING PortalUser's stored preference is never overwritten by a later invitation-acceptance upsert", async () => {
    // fixtures.portalUser already exists (seeded with the schema default,
    // SYSTEM) — accepting a second, fresh invitation for the SAME
    // identity (e.g. re-invited under a new token) must hit the upsert's
    // `update` branch, which never references themeMode at all.
    await prisma.portalUser.update({ where: { id: fixtures.portalUser.id }, data: { themeMode: "LIGHT" } });

    const invitation = await createPendingInvitation(fixtures.clientA.id, fixtures.owner.id, fixtures.portalUser.email);
    setMockAuthUser({ id: fixtures.portalUser.id, email: fixtures.portalUser.email });
    setMockThemeCookie("dark.dark");

    await expect(acceptClientInvitationAction(invitation.token)).rejects.toBeInstanceOf(RedirectSignal);

    const portalUser = await prisma.portalUser.findUnique({ where: { id: fixtures.portalUser.id } });
    expect(portalUser?.themeMode).toBe("LIGHT");

    await prisma.portalUser.update({ where: { id: fixtures.portalUser.id }, data: { themeMode: "SYSTEM" } });
  });
});

describe("Theme Persistence Phase C2 — Portal persistence Server Action (updatePortalThemeModeAction)", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterEach(async () => {
    resetAuthMock();
    await prisma.portalUser.update({ where: { id: fixtures.portalUser.id }, data: { themeMode: "SYSTEM" } });
  });

  afterAll(async () => {
    await cleanupTestData(fixtures);
  });

  it("updates only the authenticated PortalUser's own themeMode", async () => {
    setMockAuthUser({ id: fixtures.portalUser.id, email: fixtures.portalUser.email });

    await updatePortalThemeModeAction("dark");

    const persisted = await prisma.portalUser.findUnique({ where: { id: fixtures.portalUser.id } });
    expect(persisted?.themeMode).toBe("DARK");
  });

  it("rejects an invalid mode string and writes nothing", async () => {
    setMockAuthUser({ id: fixtures.portalUser.id, email: fixtures.portalUser.email });

    // @ts-expect-error — deliberately calling with a value outside the ThemeMode union.
    await expect(updatePortalThemeModeAction("purple")).rejects.toThrow("Invalid theme mode.");

    const persisted = await prisma.portalUser.findUnique({ where: { id: fixtures.portalUser.id } });
    expect(persisted?.themeMode).toBe("SYSTEM");
  });

  it("a staff User sharing the same email as the PortalUser is never touched (no staff/Portal identity leakage)", async () => {
    setMockAuthUser({ id: fixtures.portalUser.id, email: fixtures.portalUser.email });

    await updatePortalThemeModeAction("dark");

    const ownerAsUser = await prisma.user.findUnique({ where: { id: fixtures.owner.id } });
    expect(ownerAsUser?.themeMode).toBe("SYSTEM");
  });
});
