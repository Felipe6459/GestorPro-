import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/enums";
import { acceptInvitationAction } from "@/app/invite/[token]/actions";
import { acceptClientInvitationAction } from "@/app/portal/invite/[token]/actions";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { setMockAuthUser, resetAuthMock } from "../../support/auth-mock";
import { resetNavigationMock, RedirectSignal } from "../../support/navigation-mock";
import { testEmail } from "../../support/run-id";
import { TEST_EMAIL_DOMAIN } from "../../support/env";

/**
 * Platform Admin Organization Suspension, PR 2 — the invitation-blocking
 * half of this PR's owner decisions: staff and Portal invitation
 * acceptance must both be blocked while the target organization is
 * suspended, the invitation row itself must never be mutated (expired,
 * revoked, or accepted) while blocked, and the exact same pending
 * invitation must work again the instant the organization is
 * reactivated — no new invitation, no resend.
 */

const WORKSPACE_UNAVAILABLE_ERROR = "This workspace is currently unavailable. Contact support.";

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

async function suspend(organizationId: string) {
  await prisma.organization.update({ where: { id: organizationId }, data: { suspendedAt: new Date() } });
}

async function reactivate(organizationId: string) {
  await prisma.organization.update({ where: { id: organizationId }, data: { suspendedAt: null } });
}

describe("Staff invitation acceptance (acceptInvitationAction) is blocked while the target organization is suspended", () => {
  it("returns the generic workspace-unavailable error, creates no Membership, and leaves the Invitation exactly PENDING", async () => {
    const org = await prisma.organization.create({ data: { name: "Invite Suspend Staff", slug: `invite-suspend-staff-${randomUUID().slice(0, 8)}` } });
    const email = testEmail("invite-suspend-staff", TEST_EMAIL_DOMAIN, fixtures.runId);
    const invitation = await prisma.invitation.create({
      data: {
        organizationId: org.id,
        email,
        role: Role.MEMBER,
        token: randomUUID(),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await suspend(org.id);
    setMockAuthUser({ id: randomUUID(), email });

    try {
      const result = await acceptInvitationAction(invitation.token);
      expect(result).toEqual({ error: WORKSPACE_UNAVAILABLE_ERROR });

      const reread = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
      expect(reread.status).toBe("PENDING");
      expect(reread.token).toBe(invitation.token);

      const membershipCount = await prisma.membership.count({ where: { organizationId: org.id } });
      expect(membershipCount).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
      await prisma.invitation.delete({ where: { id: invitation.id } }).catch(() => {});
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });

  it("the exact same pending invitation is usable again the instant the organization is reactivated — no new invitation needed", async () => {
    const org = await prisma.organization.create({ data: { name: "Invite Reactivate Staff", slug: `invite-reactivate-staff-${randomUUID().slice(0, 8)}` } });
    const email = testEmail("invite-reactivate-staff", TEST_EMAIL_DOMAIN, fixtures.runId);
    const invitation = await prisma.invitation.create({
      data: {
        organizationId: org.id,
        email,
        role: Role.MEMBER,
        token: randomUUID(),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const authUserId = randomUUID();
    await suspend(org.id);
    setMockAuthUser({ id: authUserId, email });

    try {
      const blocked = await acceptInvitationAction(invitation.token);
      expect(blocked).toEqual({ error: WORKSPACE_UNAVAILABLE_ERROR });

      await reactivate(org.id);

      await expect(acceptInvitationAction(invitation.token)).rejects.toBeInstanceOf(RedirectSignal);

      const accepted = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
      expect(accepted.status).toBe("ACCEPTED");
      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: authUserId, organizationId: org.id } },
      });
      expect(membership).not.toBeNull();
    } finally {
      await prisma.membership.deleteMany({ where: { userId: authUserId } });
      await prisma.invitation.delete({ where: { id: invitation.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });
});

describe("Portal invitation acceptance (acceptClientInvitationAction) is blocked while the target organization is suspended", () => {
  it("returns the generic workspace-unavailable error, creates no PortalUser, and leaves the ClientInvitation exactly PENDING", async () => {
    const org = await prisma.organization.create({ data: { name: "Invite Suspend Portal", slug: `invite-suspend-portal-${randomUUID().slice(0, 8)}` } });
    const clientOwner = await prisma.user.create({
      data: { email: testEmail("invite-suspend-portal-owner", TEST_EMAIL_DOMAIN, fixtures.runId), name: "Client Owner" },
    });
    const client = await prisma.client.create({ data: { name: "Invite Suspend Client", organizationId: org.id, userId: clientOwner.id } });
    const email = testEmail("invite-suspend-portal", TEST_EMAIL_DOMAIN, fixtures.runId);
    const invitation = await prisma.clientInvitation.create({
      data: {
        clientId: client.id,
        email,
        token: randomUUID(),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: fixtures.owner.id,
      },
    });
    await suspend(org.id);
    const authUserId = randomUUID();
    setMockAuthUser({ id: authUserId, email });

    try {
      const result = await acceptClientInvitationAction(invitation.token);
      expect(result).toEqual({ error: WORKSPACE_UNAVAILABLE_ERROR });

      const reread = await prisma.clientInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
      expect(reread.status).toBe("PENDING");
      expect(reread.token).toBe(invitation.token);

      const portalUser = await prisma.portalUser.findUnique({ where: { id: authUserId } });
      expect(portalUser).toBeNull();
    } finally {
      await prisma.clientInvitation.delete({ where: { id: invitation.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: client.id } });
      await prisma.organization.delete({ where: { id: org.id } });
      await prisma.user.delete({ where: { id: clientOwner.id } });
    }
  });

  it("the exact same pending client invitation is usable again the instant the organization is reactivated", async () => {
    const org = await prisma.organization.create({ data: { name: "Invite Reactivate Portal", slug: `invite-reactivate-portal-${randomUUID().slice(0, 8)}` } });
    const clientOwner = await prisma.user.create({
      data: { email: testEmail("invite-reactivate-portal-owner", TEST_EMAIL_DOMAIN, fixtures.runId), name: "Client Owner" },
    });
    const client = await prisma.client.create({ data: { name: "Invite Reactivate Client", organizationId: org.id, userId: clientOwner.id } });
    const email = testEmail("invite-reactivate-portal", TEST_EMAIL_DOMAIN, fixtures.runId);
    const invitation = await prisma.clientInvitation.create({
      data: {
        clientId: client.id,
        email,
        token: randomUUID(),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: fixtures.owner.id,
      },
    });
    await suspend(org.id);
    const authUserId = randomUUID();
    setMockAuthUser({ id: authUserId, email });

    try {
      const blocked = await acceptClientInvitationAction(invitation.token);
      expect(blocked).toEqual({ error: WORKSPACE_UNAVAILABLE_ERROR });

      await reactivate(org.id);

      await expect(acceptClientInvitationAction(invitation.token)).rejects.toBeInstanceOf(RedirectSignal);

      const accepted = await prisma.clientInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
      expect(accepted.status).toBe("ACCEPTED");
      const portalUser = await prisma.portalUser.findUnique({ where: { id: authUserId } });
      expect(portalUser).not.toBeNull();
    } finally {
      await prisma.portalUser.deleteMany({ where: { id: authUserId } });
      await prisma.clientInvitation.delete({ where: { id: invitation.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: client.id } });
      await prisma.organization.delete({ where: { id: org.id } });
      await prisma.user.delete({ where: { id: clientOwner.id } });
    }
  });
});
