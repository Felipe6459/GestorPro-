import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getOrCreateOrganizationId } from "@/lib/current-user";
import { Role } from "@/generated/prisma/enums";

/**
 * Stability Correction — F1 (P2003 resilience gap in
 * getOrCreateOrganizationId()).
 *
 * Root cause: getOrCreateOrganizationId()'s auto-provision transaction
 * only ever handled P2002 (a concurrent *duplicate* org/membership — a
 * genuine winner already exists, so reading it back is always valid).
 * It had no handling at all for P2003 on Membership.userId — i.e. the
 * User row this transaction's own `tx.membership.create({ userId, ... })`
 * depends on no longer exists (or does not exist yet) at the exact
 * moment that insert runs. Confirmed empirically (this correction's own
 * Phase 1, a disposable, never-committed probe against this exact real
 * PGlite-backed test database) — Prisma 7.9.1's driver-adapter shape for
 * this exact violation is:
 *   err.code === "P2003"
 *   err.meta.modelName === "Membership"
 *   err.meta.driverAdapterError.cause.constraint.index === "Membership_userId_fkey"
 *
 * These tests call getOrCreateOrganizationId() directly with a `user`
 * object whose id has genuinely no backing User row — this deterministically
 * reproduces the real P2003 on the very first attempt, no timing/mocking
 * needed, and directly exercises the same function every real caller
 * (signup, first-dashboard-visit, leaveOrganizationAction) already uses.
 *
 * A second, independent discovery from this same investigation, disclosed
 * here in full: reusing this test database's shared connection for a new
 * query in the same synchronous continuation immediately after a
 * transaction the driver aborted (real `@prisma/adapter-pg` + PGlite
 * behavior) could race the driver's own async connection cleanup and hand
 * the very next query a stale, wrongly-shaped result — reproduced directly,
 * deterministically, against this exact real test database, independent of
 * this fix's own logic (a bare failed `$transaction()` followed immediately
 * by any other query reproduced it). A single `setTimeout(0)` yield before
 * the fix's own recovery query — proven sufficient across repeated runs,
 * not an arbitrary guess — resolved it; see that fix's own doc comment in
 * src/lib/current-user.ts. Disclosed honestly because it materially shaped
 * both the fix and how these tests could be written at all, not because it
 * is expected to matter in a real, multi-connection production pool.
 */

// Every User id this file creates or causes to be auto-provisioned, so
// afterEach can delete exactly what each test created — the same
// discipline every other integration test in this suite already follows
// (see e.g. test/integration/auth/signup.test.ts's own cleanupUserAndOrg),
// verified globally by test/integration/security/grants.test.ts's own
// whole-suite "no fixture rows remain anywhere" check.
let createdUserIds: string[] = [];

function trackUser(id: string): string {
  createdUserIds.push(id);
  return id;
}

afterEach(async () => {
  if (createdUserIds.length === 0) return;
  // Organization delete cascades to Membership/Subscription
  // (prisma/schema.prisma's own onDelete: Cascade on those relations) —
  // deleting by owning-User scoops up everything each test provisioned.
  const memberships = await prisma.membership.findMany({
    where: { userId: { in: createdUserIds } },
    select: { organizationId: true },
  });
  await prisma.organization.deleteMany({ where: { id: { in: memberships.map((m) => m.organizationId) } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds = [];
});

async function countRowsForUser(userId: string) {
  const [memberships, organizations, users] = await Promise.all([
    prisma.membership.findMany({ where: { userId } }),
    prisma.membership.findMany({ where: { userId } }).then((rows) =>
      prisma.organization.findMany({ where: { id: { in: rows.map((r) => r.organizationId) } } }),
    ),
    prisma.user.findMany({ where: { id: userId } }),
  ]);
  return { membershipCount: memberships.length, organizationCount: organizations.length, userCount: users.length };
}

describe("getOrCreateOrganizationId — baseline (unchanged) behavior", () => {
  it("provisions a fresh personal Organization + OWNER Membership for a genuinely new user", async () => {
    const user = { id: trackUser(randomUUID()), name: "Fresh User", email: `fresh-${randomUUID()}@test.local` };
    await prisma.user.create({ data: user });

    const organizationId = await getOrCreateOrganizationId(user);

    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    expect(membership).not.toBeNull();
    expect(membership!.role).toBe(Role.OWNER);

    const { membershipCount, organizationCount } = await countRowsForUser(user.id);
    expect(membershipCount).toBe(1);
    expect(organizationCount).toBe(1);
  });

  it("existing P2002 concurrent-duplicate-org race remains correct: two real concurrent calls resolve to the same organization, never two", async () => {
    const user = { id: trackUser(randomUUID()), name: "Concurrent User", email: `concurrent-${randomUUID()}@test.local` };
    await prisma.user.create({ data: user });

    const [orgIdA, orgIdB] = await Promise.all([
      getOrCreateOrganizationId(user),
      getOrCreateOrganizationId(user),
    ]);

    expect(orgIdA).toBe(orgIdB);
    const { membershipCount, organizationCount } = await countRowsForUser(user.id);
    expect(membershipCount).toBe(1);
    expect(organizationCount).toBe(1);
  });
});

describe("getOrCreateOrganizationId — F1: the recognized Membership.userId P2003 path", () => {
  it("recovers deterministically when the User row does not yet exist, re-establishing it and provisioning exactly one Organization + Membership", async () => {
    // Deliberately never inserted into User — this is exactly the real
    // condition (a genuinely missing backing row) the fix recovers from.
    const user = {
      id: trackUser(randomUUID()),
      name: "Recovered User",
      email: `recovered-${randomUUID()}@test.local`,
    };

    const organizationId = await getOrCreateOrganizationId(user);

    const restoredUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(restoredUser).not.toBeNull();
    expect(restoredUser!.email).toBe(user.email);

    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    expect(membership).not.toBeNull();
    expect(membership!.role).toBe(Role.OWNER);

    // No duplicate Organization/Membership from the retry.
    const { membershipCount, organizationCount, userCount } = await countRowsForUser(user.id);
    expect(membershipCount).toBe(1);
    expect(organizationCount).toBe(1);
    expect(userCount).toBe(1);
  });

  it("scopes the recovered Membership to exactly this user/organization — no cross-tenant leakage", async () => {
    const otherUser = { id: trackUser(randomUUID()), name: "Other User", email: `other-${randomUUID()}@test.local` };
    await prisma.user.create({ data: otherUser });
    const otherOrgId = await getOrCreateOrganizationId(otherUser);

    const user = {
      id: trackUser(randomUUID()),
      name: "Recovered User 2",
      email: `recovered2-${randomUUID()}@test.local`,
    };
    const organizationId = await getOrCreateOrganizationId(user);

    expect(organizationId).not.toBe(otherOrgId);
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    expect(membership!.organizationId).toBe(organizationId);
    expect(membership!.userId).toBe(user.id);
  });

  it("terminates deterministically, without leaking a raw Prisma error, if the User row genuinely cannot be re-established", async () => {
    // Pre-create a *different* existing User row with the exact email the
    // retry's own upsert would need to create — its create-branch then
    // collides on User.email (a different, unrelated constraint), proving
    // the bounded "at most one retry, then a deterministic application
    // error" behavior rather than a second silent retry loop or a raw
    // Prisma error surfacing to the caller.
    const collidingEmail = `colliding-${randomUUID()}@test.local`;
    await prisma.user.create({
      data: { id: trackUser(randomUUID()), name: "Colliding User", email: collidingEmail },
    });

    const user = { id: trackUser(randomUUID()), name: "Doomed User", email: collidingEmail };

    await expect(getOrCreateOrganizationId(user)).rejects.toThrow(
      "Unable to set up your organization. Please try again.",
    );

    // Confirm no raw Prisma error class ever reached the caller.
    try {
      await getOrCreateOrganizationId(user);
      expect.fail("expected getOrCreateOrganizationId to reject");
    } catch (err) {
      expect(err).not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    }

    // And no partial/duplicate rows were left behind by the failed retry.
    const { membershipCount, organizationCount } = await countRowsForUser(user.id);
    expect(membershipCount).toBe(0);
    expect(organizationCount).toBe(0);
  });
});
