import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOrganizationDetail } from "@/lib/platform-admin/queries/organization-detail";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { setMockAuthUser, resetAuthMock } from "../../support/auth-mock";

/**
 * Recent Admin Actions (Organization Detail). getOrganizationDetail()'s
 * own execution-level authorization guard (requirePlatformAdmin() as the
 * first awaited operation, before any Prisma call) is already fully
 * proven, for this exact function, by test/integration/platform-admin/
 * execution-authorization.test.ts — unchanged and unmodified by this
 * feature, so it is not re-proven here. This file instead proves the
 * *content* correctness of the new `recentAdminActions` field
 * specifically: organization scoping, bounded newest-first ordering with
 * a deterministic tie-break, and — using this repo's own established
 * MARKERS technique (see failure-monitoring.test.ts) — that only the
 * intended safe fields ever reach the returned shape.
 */

const PLATFORM_ADMIN_TEST_EMAIL = "platform-admin-recent-admin-actions-test@example.com";
const ORIGINAL_PLATFORM_ADMIN_EMAILS = process.env.PLATFORM_ADMIN_EMAILS;

const MARKERS = {
  actorEmail: "marker-admin@example-marker-domain.test",
};

let fixtures: TestFixtures;

beforeAll(async () => {
  fixtures = await seedTestData();
  process.env.PLATFORM_ADMIN_EMAILS = PLATFORM_ADMIN_TEST_EMAIL;
});

afterAll(async () => {
  process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL_PLATFORM_ADMIN_EMAILS;
  await cleanupTestData(fixtures);
});

afterEach(async () => {
  resetAuthMock();
  await prisma.platformAdminAuditEvent.deleteMany({ where: { organizationId: { in: [fixtures.orgA.id, fixtures.orgB.id] } } });
});

function asPlatformAdmin() {
  setMockAuthUser({ id: randomUUID(), email: PLATFORM_ADMIN_TEST_EMAIL });
}

async function createEvent(
  organizationId: string,
  overrides: { id?: string; action?: "ORGANIZATION_SUSPENDED" | "ORGANIZATION_REACTIVATED"; reasonCode?: string | null; actorEmail?: string; createdAt?: Date },
) {
  return prisma.platformAdminAuditEvent.create({
    data: {
      id: overrides.id ?? randomUUID(),
      organizationId,
      action: overrides.action ?? "ORGANIZATION_SUSPENDED",
      // "reasonCode" in overrides distinguishes "not provided" (default to
      // "OTHER") from "explicitly passed as null" (Reactivate's own real
      // shape) — a plain `??` would collapse both cases, since `null` is
      // just as nullish as `undefined`.
      reasonCode: "reasonCode" in overrides ? (overrides.reasonCode as string | null) : "OTHER",
      actorEmail: overrides.actorEmail ?? MARKERS.actorEmail,
      createdAt: overrides.createdAt ?? new Date(),
    },
  });
}

describe("getOrganizationDetail — recentAdminActions is scoped to the requested organization only", () => {
  it("never includes an event that belongs to a different organization", async () => {
    await createEvent(fixtures.orgA.id, { actorEmail: "org-a-admin@example-marker-domain.test" });
    await createEvent(fixtures.orgB.id, { actorEmail: "org-b-admin@example-marker-domain.test" });

    asPlatformAdmin();
    const detailA = await getOrganizationDetail(fixtures.orgA.id, new Date());
    const detailB = await getOrganizationDetail(fixtures.orgB.id, new Date());

    expect(detailA?.recentAdminActions).toHaveLength(1);
    expect(detailA?.recentAdminActions[0].actorEmail).toBe("org-a-admin@example-marker-domain.test");
    expect(detailB?.recentAdminActions).toHaveLength(1);
    expect(detailB?.recentAdminActions[0].actorEmail).toBe("org-b-admin@example-marker-domain.test");
  });
});

describe("getOrganizationDetail — recentAdminActions bounded newest-first ordering", () => {
  it("returns events in descending createdAt order", async () => {
    const now = Date.now();
    await createEvent(fixtures.orgA.id, { actorEmail: "oldest@example-marker-domain.test", createdAt: new Date(now - 3000) });
    await createEvent(fixtures.orgA.id, { actorEmail: "middle@example-marker-domain.test", createdAt: new Date(now - 2000) });
    await createEvent(fixtures.orgA.id, { actorEmail: "newest@example-marker-domain.test", createdAt: new Date(now - 1000) });

    asPlatformAdmin();
    const detail = await getOrganizationDetail(fixtures.orgA.id, new Date());

    expect(detail?.recentAdminActions.map((e) => e.actorEmail)).toEqual([
      "newest@example-marker-domain.test",
      "middle@example-marker-domain.test",
      "oldest@example-marker-domain.test",
    ]);
  });

  it("breaks a tie on identical createdAt values by id, descending — deterministic, not insertion-order-dependent", async () => {
    const sharedInstant = new Date();
    // Deliberately inserted in ascending-id order — if the query's own
    // orderBy tie-break were silently dropped or reversed, this would
    // read back in insertion order instead of the required id-desc order.
    await createEvent(fixtures.orgA.id, {
      id: "00000000-0000-0000-0000-000000000001",
      actorEmail: "lower-id@example-marker-domain.test",
      createdAt: sharedInstant,
    });
    await createEvent(fixtures.orgA.id, {
      id: "00000000-0000-0000-0000-000000000002",
      actorEmail: "higher-id@example-marker-domain.test",
      createdAt: sharedInstant,
    });

    asPlatformAdmin();
    const detail = await getOrganizationDetail(fixtures.orgA.id, new Date());

    expect(detail?.recentAdminActions.map((e) => e.actorEmail)).toEqual([
      "higher-id@example-marker-domain.test",
      "lower-id@example-marker-domain.test",
    ]);
  });

  it("is bounded — more than the take limit exist, only the 10 most recent are returned", async () => {
    const now = Date.now();
    for (let i = 0; i < 13; i++) {
      await createEvent(fixtures.orgA.id, {
        actorEmail: `event-${i}@example-marker-domain.test`,
        createdAt: new Date(now - i * 1000),
      });
    }

    asPlatformAdmin();
    const detail = await getOrganizationDetail(fixtures.orgA.id, new Date());

    expect(detail?.recentAdminActions).toHaveLength(10);
    // The 10 most recent are events 0-9 (i=0 is "now", the newest); events
    // 10-12 (the three oldest) must be excluded, not just truncated
    // arbitrarily.
    expect(detail?.recentAdminActions.map((e) => e.actorEmail)).toEqual(
      Array.from({ length: 10 }, (_, i) => `event-${i}@example-marker-domain.test`),
    );
  });
});

describe("getOrganizationDetail — recentAdminActions exposes only the intended safe fields", () => {
  it("returns exactly {action, reasonCode, actorEmail, createdAt} — no id, no organizationId, no other field", async () => {
    await createEvent(fixtures.orgA.id, { action: "ORGANIZATION_SUSPENDED", reasonCode: "POLICY_VIOLATION" });

    asPlatformAdmin();
    const detail = await getOrganizationDetail(fixtures.orgA.id, new Date());

    expect(detail?.recentAdminActions).toHaveLength(1);
    const [event] = detail!.recentAdminActions;
    expect(Object.keys(event).sort()).toEqual(["action", "actorEmail", "createdAt", "reasonCode"]);
  });

  it("never includes the audit row's own id or the organization's raw id/slug/name anywhere in the returned event shape", async () => {
    const event = await createEvent(fixtures.orgA.id, {});

    asPlatformAdmin();
    const detail = await getOrganizationDetail(fixtures.orgA.id, new Date());

    const serialized = JSON.stringify(detail?.recentAdminActions);
    expect(serialized).not.toContain(event.id);
    expect(serialized).not.toContain(fixtures.orgA.id);
    expect(serialized).not.toContain(fixtures.orgA.slug);
  });

  it("never leaks the organization owner's own email into a recentAdminActions row — actorEmail is always the acting Platform Admin, never a customer identity", async () => {
    await createEvent(fixtures.orgA.id, { actorEmail: MARKERS.actorEmail });

    asPlatformAdmin();
    const detail = await getOrganizationDetail(fixtures.orgA.id, new Date());

    for (const event of detail?.recentAdminActions ?? []) {
      expect(event.actorEmail).not.toBe(fixtures.owner.email);
    }
    expect(detail?.recentAdminActions[0].actorEmail).toBe(MARKERS.actorEmail);
  });

  it("Reactivate rows carry a null reasonCode, exactly as written — never coerced to a placeholder", async () => {
    await createEvent(fixtures.orgA.id, { action: "ORGANIZATION_REACTIVATED", reasonCode: null });

    asPlatformAdmin();
    const detail = await getOrganizationDetail(fixtures.orgA.id, new Date());

    expect(detail?.recentAdminActions[0]).toMatchObject({ action: "ORGANIZATION_REACTIVATED", reasonCode: null });
  });
});

describe("getOrganizationDetail — recentAdminActions empty state", () => {
  it("is an empty array for an organization with no admin actions recorded", async () => {
    asPlatformAdmin();
    const detail = await getOrganizationDetail(fixtures.orgA.id, new Date());
    expect(detail?.recentAdminActions).toEqual([]);
  });
});
