import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOrCreateOrganizationId } from "@/lib/current-user";

/**
 * Production Observability Correction 2 — bounded diagnostic for the F1
 * Membership.userId FK race recovery. Runs against the real repository
 * database harness (PGlite), reusing
 * test/integration/auth/organization-provisioning.test.ts's own
 * established real-data reproduction technique exactly (a `user` object
 * with a genuinely missing backing User row deterministically reproduces
 * the real P2003 on the first attempt — no mocking of Prisma or of
 * getOrCreateOrganizationId() itself). This file adds diagnostic
 * assertions on top of that already-proven recovery behavior; it does not
 * re-prove the recovery itself, which the existing file already covers in
 * full.
 */

const EVENT_MESSAGE = "[organization-provisioning] Membership FK race recovered.";

// Deliberately identifiable marker values — the same technique
// test/unit/portal-analytics-failure-classification.test.ts and PR #111's
// own test/integration/invoices/issue-diagnostics.test.ts already
// established — planted here even though this diagnostic takes no
// parameters at all, to prove structurally that nothing else can ever
// appear in its logged call regardless of what a future edit might try to
// pass.
const MARKERS = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "marker-user@example-marker-domain.test",
};

let createdUserIds: string[] = [];

function trackUser(id: string): string {
  createdUserIds.push(id);
  return id;
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (createdUserIds.length === 0) return;
  const memberships = await prisma.membership.findMany({
    where: { userId: { in: createdUserIds } },
    select: { organizationId: true },
  });
  await prisma.organization.deleteMany({ where: { id: { in: memberships.map((m) => m.organizationId) } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds = [];
});

async function countRowsForUser(userId: string) {
  const [memberships, users] = await Promise.all([
    prisma.membership.findMany({ where: { userId } }),
    prisma.user.findMany({ where: { id: userId } }),
  ]);
  return { membershipCount: memberships.length, userCount: users.length };
}

describe("getOrCreateOrganizationId diagnostics — F1 recovery signal", () => {
  it("ordinary successful provisioning (no race at all) emits no diagnostic", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = { id: trackUser(randomUUID()), name: "Fresh User", email: MARKERS.email };
    await prisma.user.create({ data: user });

    const organizationId = await getOrCreateOrganizationId(user);

    expect(organizationId).toBeTruthy();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("the existing P2002 concurrent-duplicate-org race (unrelated to F1) emits no F1 diagnostic", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = { id: trackUser(randomUUID()), name: "Concurrent User", email: `concurrent-${randomUUID()}@test.local` };
    await prisma.user.create({ data: user });

    await Promise.all([getOrCreateOrganizationId(user), getOrCreateOrganizationId(user)]);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("a real, recognized Membership_userId_fkey race that recovers successfully logs the fixed warning exactly once, only after recovery, with no argument beyond the fixed message", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Deliberately never inserted into User — reproduces the real P2003
    // on the very first attempt, exactly like
    // organization-provisioning.test.ts's own "recovers deterministically"
    // test.
    const user = {
      id: trackUser(randomUUID()),
      name: "Recovered User",
      email: `recovered-diag-${randomUUID()}@test.local`,
    };

    const organizationId = await getOrCreateOrganizationId(user);

    // The recovery genuinely happened (same proof the existing test uses).
    const restoredUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(restoredUser).not.toBeNull();
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    expect(membership).not.toBeNull();

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(EVENT_MESSAGE);
    // Exactly one argument — the fixed message alone, nothing else.
    expect(consoleWarnSpy.mock.calls[0]).toHaveLength(1);

    const serialized = JSON.stringify(consoleWarnSpy.mock.calls);
    expect(serialized).not.toContain(user.id);
    expect(serialized).not.toContain(organizationId);
    expect(serialized).not.toContain(membership!.id);
    for (const marker of Object.values(MARKERS)) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("no duplicate User/Organization/Membership rows are left behind by the recovered attempt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = {
      id: trackUser(randomUUID()),
      name: "Recovered User 2",
      email: `recovered-diag2-${randomUUID()}@test.local`,
    };

    const organizationId = await getOrCreateOrganizationId(user);

    const { membershipCount, userCount } = await countRowsForUser(user.id);
    expect(membershipCount).toBe(1);
    expect(userCount).toBe(1);
    const organizations = await prisma.organization.findMany({ where: { id: organizationId } });
    expect(organizations).toHaveLength(1);
  });

  it("a failed retry (User row genuinely cannot be re-established) never logs the recovered warning — no misleading signal", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Same fixture shape as organization-provisioning.test.ts's own
    // "terminates deterministically" test: a pre-existing User row with
    // the exact email the retry's own upsert would need, so its
    // create-branch collides on User.email and the retry genuinely fails.
    const collidingEmail = `colliding-diag-${randomUUID()}@test.local`;
    await prisma.user.create({
      data: { id: trackUser(randomUUID()), name: "Colliding User", email: collidingEmail },
    });
    const user = { id: trackUser(randomUUID()), name: "Doomed User", email: collidingEmail };

    await expect(getOrCreateOrganizationId(user)).rejects.toThrow(
      "Unable to set up your organization. Please try again.",
    );

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  // Confirmation that this diagnostic's own call site is gated by the
  // exact same narrow classifier the recovery itself uses (never a
  // broader "any P2003" check) is already exhaustively proven, unchanged,
  // by test/unit/current-user-p2003-classifier.test.ts's own "does not
  // misclassify a different FK constraint on the same model" and "does
  // not misclassify a P2003 on a different model entirely" tests — not
  // re-duplicated here, since isMembershipUserForeignKeyViolation() itself
  // is byte-for-byte unchanged by this correction.
});
