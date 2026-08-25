import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { getCurrentPortalUser } from "@/lib/current-portal-user";
import { getSearchRequestContext } from "@/lib/search/request-context";
import { getOrganizationDetail } from "@/lib/platform-admin/queries/organization-detail";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { setMockAuthUser, setMockActiveOrganization, resetAuthMock, resetMockCookies } from "../../support/auth-mock";
import { RedirectSignal, resetNavigationMock } from "../../support/navigation-mock";
import { getRunId, testEmail, testSlug } from "../../support/run-id";
import { TEST_EMAIL_DOMAIN } from "../../support/env";

/**
 * Platform Admin Organization Suspension, PR 1 (design investigation:
 * PLATFORM_ADMIN_ORGANIZATION_SUSPENSION_DESIGN). Proves the three
 * independently-confirmed organization-resolution paths (staff, Portal,
 * search) all honor Organization.suspendedAt identically, and that the
 * one critical failure mode this feature's own design investigation
 * found — a suspended sole membership silently falling through to
 * getOrCreateOrganizationId()'s auto-provisioning branch — cannot occur.
 *
 * No Server Action, mutation, or UI exists yet (PR 2) — every
 * Organization.suspendedAt value in this file is set directly via Prisma,
 * exactly the way a genuine E2E test would have to if this PR shipped
 * with a real mutation it doesn't yet have.
 */

async function createUser(label: string) {
  const id = randomUUID();
  const email = testEmail(label, TEST_EMAIL_DOMAIN, `${getRunId()}-susp-${randomUUID().slice(0, 8)}`);
  const user = await prisma.user.create({ data: { id, email, name: `Suspension Test ${label}` } });
  return { id: user.id, email: user.email, name: user.name };
}

async function createOrg(label: string) {
  return prisma.organization.create({
    data: { name: `Suspension Test ${label}`, slug: testSlug(`susp-${label}-${randomUUID().slice(0, 8)}`) },
  });
}

async function suspend(organizationId: string) {
  await prisma.organization.update({ where: { id: organizationId }, data: { suspendedAt: new Date() } });
}

async function catchRedirect(fn: () => Promise<unknown>): Promise<RedirectSignal> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(RedirectSignal);
  return caught as RedirectSignal;
}

let fixtures: TestFixtures;

beforeAll(async () => {
  fixtures = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData(fixtures);
});

afterEach(() => {
  resetAuthMock();
  resetMockCookies();
  resetNavigationMock();
});

describe("Migration is additive — existing organizations remain active", () => {
  it("a freshly created organization defaults suspendedAt to null", async () => {
    const org = await createOrg("fresh-default");
    try {
      const row = await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { suspendedAt: true } });
      expect(row.suspendedAt).toBeNull();
    } finally {
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });

  it("every existing seeded organization (created before this test file ran) is still active", async () => {
    const orgA = await prisma.organization.findUniqueOrThrow({ where: { id: fixtures.orgA.id }, select: { suspendedAt: true } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { id: fixtures.orgB.id }, select: { suspendedAt: true } });
    expect(orgA.suspendedAt).toBeNull();
    expect(orgB.suspendedAt).toBeNull();
  });
});

describe("Staff resolution (getCurrentUserOrganization) — active organization behaves exactly as before", () => {
  for (const [label, user] of [
    ["OWNER", () => fixtures.owner] as const,
    ["ADMIN", () => fixtures.admin] as const,
    ["MEMBER", () => fixtures.member] as const,
  ]) {
    it(`${label} resolves the real, active organization normally`, async () => {
      setMockAuthUser(user());
      const { organizationId } = await getCurrentUserOrganization();
      expect(organizationId).toBe(fixtures.orgA.id);
    });
  }
});

describe("Staff resolution (getCurrentUserOrganization) — suspended organization denies every role", () => {
  let suspendedOrg: { id: string };
  let owner: { id: string; email: string; name: string };
  let admin: { id: string; email: string; name: string };
  let member: { id: string; email: string; name: string };

  beforeAll(async () => {
    suspendedOrg = await createOrg("staff-deny");
    [owner, admin, member] = await Promise.all([createUser("staff-deny-owner"), createUser("staff-deny-admin"), createUser("staff-deny-member")]);
    await prisma.membership.createMany({
      data: [
        { userId: owner.id, organizationId: suspendedOrg.id, role: Role.OWNER },
        { userId: admin.id, organizationId: suspendedOrg.id, role: Role.ADMIN },
        { userId: member.id, organizationId: suspendedOrg.id, role: Role.MEMBER },
      ],
    });
    await suspend(suspendedOrg.id);
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: suspendedOrg.id } }); // cascades memberships
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, admin.id, member.id] } } });
  });

  for (const [label, getUser] of [
    ["OWNER", () => owner] as const,
    ["ADMIN", () => admin] as const,
    ["MEMBER", () => member] as const,
  ]) {
    it(`${label} is redirected to /organization-unavailable, never resolves the organization`, async () => {
      setMockAuthUser(getUser());
      const signal = await catchRedirect(() => getCurrentUserOrganization());
      expect(signal.url).toBe("/organization-unavailable");
    });
  }

  it("a suspended sole membership never auto-provisions a replacement organization", async () => {
    setMockAuthUser(owner);
    const before = await prisma.organization.count();
    await catchRedirect(() => getCurrentUserOrganization());
    const after = await prisma.organization.count();
    expect(after).toBe(before);
    // The user's only membership is still the one, still-suspended
    // organization — never a second Membership row.
    const memberships = await prisma.membership.findMany({ where: { userId: owner.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].organizationId).toBe(suspendedOrg.id);
  });

  it("the active-organization cookie pointing at the suspended org is not trusted", async () => {
    setMockAuthUser(owner);
    setMockActiveOrganization(suspendedOrg.id);
    const signal = await catchRedirect(() => getCurrentUserOrganization());
    expect(signal.url).toBe("/organization-unavailable");
  });
});

describe("Staff resolution — a multi-organization user keeps using their other, non-suspended organization", () => {
  let user: { id: string; email: string; name: string };
  let suspendedOrg: { id: string };
  let activeOrg: { id: string };

  beforeAll(async () => {
    user = await createUser("multi-org");
    suspendedOrg = await createOrg("multi-org-suspended");
    activeOrg = await createOrg("multi-org-active");
    await prisma.membership.createMany({
      data: [
        { userId: user.id, organizationId: suspendedOrg.id, role: Role.OWNER },
        { userId: user.id, organizationId: activeOrg.id, role: Role.MEMBER },
      ],
    });
    await suspend(suspendedOrg.id);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [suspendedOrg.id, activeOrg.id] } } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("with no active-organization cookie, resolves the non-suspended organization, not the suspended one", async () => {
    setMockAuthUser(user);
    const { organizationId } = await getCurrentUserOrganization();
    expect(organizationId).toBe(activeOrg.id);
  });

  it("with the cookie pointing at the suspended organization, falls back to the non-suspended one instead of denying", async () => {
    setMockAuthUser(user);
    setMockActiveOrganization(suspendedOrg.id);
    const { organizationId } = await getCurrentUserOrganization();
    expect(organizationId).toBe(activeOrg.id);
  });
});

describe("Portal resolution (getCurrentPortalUser) denies a suspended organization", () => {
  it("a Client Portal user is redirected to /organization-unavailable when their organization is suspended", async () => {
    const org = await createOrg("portal-deny");
    // A dedicated staff User for Client.userId (Restrict, never Cascade —
    // reusing a shared fixture user here would leave it referenced by an
    // orphaned Client if this test's own cleanup ran in the wrong order;
    // see this same reasoning below for why the Client is deleted before
    // the Organization, not relied on to cascade — Client.organizationId
    // is SetNull, not Cascade).
    const clientOwner = await createUser("portal-deny-client-owner");
    const client = await prisma.client.create({ data: { name: "Portal Deny Client", organizationId: org.id, userId: clientOwner.id } });
    const portalUserId = randomUUID();
    const portalUser = await prisma.portalUser.create({
      data: { id: portalUserId, email: testEmail("portal-deny", TEST_EMAIL_DOMAIN), name: "Portal Deny User", clientId: client.id },
    });
    await suspend(org.id);
    try {
      setMockAuthUser({ id: portalUser.id, email: portalUser.email });
      const signal = await catchRedirect(() => getCurrentPortalUser());
      expect(signal.url).toBe("/organization-unavailable");
    } finally {
      await prisma.portalUser.delete({ where: { id: portalUser.id } });
      await prisma.client.delete({ where: { id: client.id } });
      await prisma.organization.delete({ where: { id: org.id } });
      await prisma.user.delete({ where: { id: clientOwner.id } });
    }
  });
});

describe("Search resolution (getSearchRequestContext) cannot bypass suspension, and preserves its own JSON contract", () => {
  it("a suspended sole membership resolves to { ok: false, status: 403 } — never a redirect, never a thrown RedirectSignal", async () => {
    const org = await createOrg("search-deny");
    const user = await createUser("search-deny");
    await prisma.membership.create({ data: { userId: user.id, organizationId: org.id, role: Role.OWNER } });
    await suspend(org.id);
    try {
      setMockAuthUser(user);
      let thrown: unknown;
      let context: Awaited<ReturnType<typeof getSearchRequestContext>> | undefined;
      try {
        context = await getSearchRequestContext();
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeUndefined();
      expect(context).toEqual({ ok: false, status: 403 });
    } finally {
      await prisma.organization.delete({ where: { id: org.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("a multi-organization user still gets a valid search context for their non-suspended organization", async () => {
    const suspendedOrg = await createOrg("search-multi-suspended");
    const activeOrg = await createOrg("search-multi-active");
    const user = await createUser("search-multi");
    await prisma.membership.createMany({
      data: [
        { userId: user.id, organizationId: suspendedOrg.id, role: Role.OWNER },
        { userId: user.id, organizationId: activeOrg.id, role: Role.MEMBER },
      ],
    });
    await suspend(suspendedOrg.id);
    try {
      setMockAuthUser(user);
      const context = await getSearchRequestContext();
      expect(context).toEqual({ ok: true, userId: user.id, organizationId: activeOrg.id, role: Role.MEMBER });
    } finally {
      await prisma.organization.deleteMany({ where: { id: { in: [suspendedOrg.id, activeOrg.id] } } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("active organizations behave exactly as before (regression)", async () => {
    setMockAuthUser(fixtures.owner);
    const context = await getSearchRequestContext();
    expect(context).toEqual({ ok: true, userId: fixtures.owner.id, organizationId: fixtures.orgA.id, role: Role.OWNER });
  });
});

describe("Platform Admin reads remain fully available for a suspended organization", () => {
  const PLATFORM_ADMIN_TEST_EMAIL = "platform-admin-suspension-test@example.com";
  const ORIGINAL_PLATFORM_ADMIN_EMAILS = process.env.PLATFORM_ADMIN_EMAILS;

  afterAll(() => {
    if (ORIGINAL_PLATFORM_ADMIN_EMAILS === undefined) {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    } else {
      process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL_PLATFORM_ADMIN_EMAILS;
    }
  });

  it("getOrganizationDetail still returns real data for a suspended organization", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = PLATFORM_ADMIN_TEST_EMAIL;
    setMockAuthUser({ id: randomUUID(), email: PLATFORM_ADMIN_TEST_EMAIL });
    await suspend(fixtures.orgA.id);
    try {
      const detail = await getOrganizationDetail(fixtures.orgA.id, new Date());
      expect(detail?.organization.id).toBe(fixtures.orgA.id);
    } finally {
      await prisma.organization.update({ where: { id: fixtures.orgA.id }, data: { suspendedAt: null } });
    }
  });
});

describe("Billing writes remain unaffected by suspension", () => {
  it("a Subscription row for a suspended organization can still be written, exactly like an active one", async () => {
    const org = await createOrg("billing-unaffected");
    await suspend(org.id);
    try {
      const subscription = await prisma.subscription.create({
        data: {
          organizationId: org.id,
          planKey: "STARTER",
          status: "ACTIVE",
          trialStartedAt: new Date(),
          trialEndsAt: new Date(),
        },
      });
      expect(subscription.organizationId).toBe(org.id);

      const updated = await prisma.subscription.update({
        where: { organizationId: org.id },
        data: { status: "PAST_DUE" },
      });
      expect(updated.status).toBe("PAST_DUE");
    } finally {
      await prisma.organization.delete({ where: { id: org.id } }); // cascades the Subscription
    }
  });
});
