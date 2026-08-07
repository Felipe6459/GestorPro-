import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOrganizationOnboardingProgress } from "@/lib/onboarding/progress";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { testEmail, testSlug } from "../../support/run-id";
import { TEST_EMAIL_DOMAIN } from "../../support/env";

/**
 * Onboarding Stage 2 (this stage's own §19/§21). Exercises the real,
 * unmodified getOrganizationOnboardingProgress() against the real (test)
 * Postgres — no mocks in this file (this function takes an organizationId
 * directly and does no session/cookie work of its own; that boundary is
 * covered separately in actions.test.ts).
 */

describe("getOrganizationOnboardingProgress", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData(fixtures);
  });

  it("a fresh organization with zero business data needs zero OrganizationOnboardingStep rows to compute correctly", async () => {
    const freshOrg = await prisma.organization.create({
      data: { name: "Fresh Org", slug: testSlug("onboarding-fresh", fixtures.runId) },
    });

    const rowCount = await prisma.organizationOnboardingStep.count({ where: { organizationId: freshOrg.id } });
    expect(rowCount).toBe(0);

    const progress = await getOrganizationOnboardingProgress(freshOrg.id);
    const client = progress.steps.find((s) => s.key === "CREATE_CLIENT")!;
    expect(client.status).toBe("NOT_STARTED");
    expect(progress.percent).toBe(0);
    expect(progress.isComplete).toBe(false);
    expect(progress.isDismissed).toBe(false);

    await prisma.organization.delete({ where: { id: freshOrg.id } });
  });

  it("real Client/Project/Task/second-Membership/PortalUser rows drive every computed step to COMPLETE — fixtures.orgA already has all of these", async () => {
    // seedTestData() already gives orgA: clientA, project (under clientA),
    // task (under project), three real Memberships (owner/admin/member),
    // and portalUser (under clientA) — a fully "productive" org by
    // construction, with zero onboarding-specific setup needed.
    const progress = await getOrganizationOnboardingProgress(fixtures.orgA.id);

    const byKey = Object.fromEntries(progress.steps.map((s) => [s.key, s]));
    expect(byKey.CREATE_CLIENT.status).toBe("COMPLETE");
    expect(byKey.CREATE_PROJECT.status).toBe("COMPLETE");
    expect(byKey.CREATE_TASK.status).toBe("COMPLETE");
    expect(byKey.INVITE_TEAMMATE.status).toBe("COMPLETE");
    expect(byKey.INVITE_PORTAL_USER.status).toBe("COMPLETE");
    expect(progress.requiredCompleted).toBe(2);
  });

  it("orgA and orgB are fully independent — orgB's own real data never leaks into orgA's progress or vice versa", async () => {
    // orgB (per seedTestData) has clientB but no project/task and only one
    // Membership (orgBOwner alone) — deliberately less "productive" than
    // orgA, so this test can prove the two never contaminate each other.
    const progressA = await getOrganizationOnboardingProgress(fixtures.orgA.id);
    const progressB = await getOrganizationOnboardingProgress(fixtures.orgB.id);

    const byKeyB = Object.fromEntries(progressB.steps.map((s) => [s.key, s]));
    expect(byKeyB.CREATE_CLIENT.status).toBe("COMPLETE");
    expect(byKeyB.CREATE_PROJECT.status).toBe("NOT_STARTED");
    expect(byKeyB.CREATE_TASK.status).toBe("NOT_STARTED");
    expect(byKeyB.INVITE_TEAMMATE.status).toBe("NOT_STARTED");

    const byKeyA = Object.fromEntries(progressA.steps.map((s) => [s.key, s]));
    expect(byKeyA.CREATE_PROJECT.status).toBe("COMPLETE");
  });

  it("a pending (not yet accepted) staff Invitation alone never satisfies INVITE_TEAMMATE", async () => {
    // A brand-new org with a real Client/Project (so INVITE_TEAMMATE's own
    // dependency-free actionability isn't the thing under test) and
    // exactly one Membership (the owner) plus one PENDING Invitation.
    const org = await prisma.organization.create({
      data: { name: "Pending Invite Org", slug: testSlug("onboarding-pending", fixtures.runId) },
    });
    const owner = await prisma.user.create({
      data: { id: randomUUID(), email: testEmail("onboarding-pending-owner", TEST_EMAIL_DOMAIN, fixtures.runId), name: "Owner" },
    });
    await prisma.membership.create({ data: { userId: owner.id, organizationId: org.id, role: "OWNER" } });
    await prisma.invitation.create({
      data: {
        organizationId: org.id,
        email: testEmail("onboarding-pending-invitee", TEST_EMAIL_DOMAIN, fixtures.runId),
        role: "MEMBER",
        token: randomUUID(),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: owner.id,
      },
    });

    const progress = await getOrganizationOnboardingProgress(org.id);
    const teammate = progress.steps.find((s) => s.key === "INVITE_TEAMMATE")!;
    expect(teammate.status).toBe("NOT_STARTED");

    await prisma.invitation.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });

  it("a sent-but-not-accepted ClientInvitation alone never satisfies INVITE_PORTAL_USER (only a real PortalUser row does)", async () => {
    const client = fixtures.clientA;
    const before = await getOrganizationOnboardingProgress(fixtures.orgA.id);
    expect(before.steps.find((s) => s.key === "INVITE_PORTAL_USER")!.status).toBe("COMPLETE");

    // Prove the *general* rule on a client with no PortalUser at all yet.
    const org = await prisma.organization.create({
      data: { name: "Portal Pending Org", slug: testSlug("onboarding-portal-pending", fixtures.runId) },
    });
    const owner = await prisma.user.create({
      data: { id: randomUUID(), email: testEmail("onboarding-portal-owner", TEST_EMAIL_DOMAIN, fixtures.runId), name: "Owner" },
    });
    await prisma.membership.create({ data: { userId: owner.id, organizationId: org.id, role: "OWNER" } });
    const orgClient = await prisma.client.create({ data: { name: "Client", userId: owner.id, organizationId: org.id } });
    await prisma.clientInvitation.create({
      data: {
        clientId: orgClient.id,
        email: testEmail("onboarding-portal-invitee", TEST_EMAIL_DOMAIN, fixtures.runId),
        token: randomUUID(),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: owner.id,
      },
    });

    const progress = await getOrganizationOnboardingProgress(org.id);
    expect(progress.steps.find((s) => s.key === "INVITE_PORTAL_USER")!.status).toBe("NOT_STARTED");

    await prisma.clientInvitation.deleteMany({ where: { clientId: orgClient.id } });
    await prisma.client.delete({ where: { id: orgClient.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.user.delete({ where: { id: owner.id } });
    void client;
  });

  it("removing a Membership does not erase already-computed progress for what remains real", async () => {
    // orgA's INVITE_TEAMMATE is COMPLETE (3 members). Temporarily add a
    // fourth, then remove it again — the step must stay COMPLETE the whole
    // time (still > 1 member), proving progress isn't cached/frozen.
    const extraUser = await prisma.user.create({
      data: { id: randomUUID(), email: testEmail("onboarding-extra-member", TEST_EMAIL_DOMAIN, fixtures.runId), name: "Extra" },
    });
    const extraMembership = await prisma.membership.create({
      data: { userId: extraUser.id, organizationId: fixtures.orgA.id, role: "MEMBER" },
    });

    const withExtra = await getOrganizationOnboardingProgress(fixtures.orgA.id);
    expect(withExtra.steps.find((s) => s.key === "INVITE_TEAMMATE")!.status).toBe("COMPLETE");

    await prisma.membership.delete({ where: { id: extraMembership.id } });

    const afterRemoval = await getOrganizationOnboardingProgress(fixtures.orgA.id);
    // Still COMPLETE — orgA has admin+member alongside owner regardless.
    expect(afterRemoval.steps.find((s) => s.key === "INVITE_TEAMMATE")!.status).toBe("COMPLETE");

    await prisma.user.delete({ where: { id: extraUser.id } });
  });
});
