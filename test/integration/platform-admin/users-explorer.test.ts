import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PAGE_SIZE } from "@/lib/list-params";
import { listUsers, parseUserListParams, type UserListParams } from "@/lib/platform-admin/queries/users";
import { setMockAuthUser, resetAuthMock } from "../../support/auth-mock";

/**
 * Platform Admin Users Explorer, PR 1. listUsers()'s own execution-level
 * authorization guard (requirePlatformAdmin() as the first awaited
 * operation) is already proven, for this exact function, by
 * execution-authorization.test.ts's own new "listUsers — execution-level
 * guard" block — unchanged and unmodified by this file, so it is not
 * re-proven here. This file proves the *content* correctness of the list
 * itself: search, sort, pagination, multi-organization membership
 * pairing, and that only the intended safe fields ever reach the
 * returned shape.
 *
 * Every fixture in this file carries a unique per-run marker in its name
 * (or email, for the email-search test) so search-scoped assertions are
 * never polluted by whatever else the shared test database happens to
 * contain from other, concurrently-run test files.
 */

const PLATFORM_ADMIN_TEST_EMAIL = "platform-admin-users-explorer-test@example.com";
const ORIGINAL_PLATFORM_ADMIN_EMAILS = process.env.PLATFORM_ADMIN_EMAILS;

const MARKER = `usersexplorer${randomUUID().slice(0, 8)}`;

const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdPortalUserIds: string[] = [];
const createdClientIds: string[] = [];

beforeAll(() => {
  process.env.PLATFORM_ADMIN_EMAILS = PLATFORM_ADMIN_TEST_EMAIL;
});

afterAll(async () => {
  process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL_PLATFORM_ADMIN_EMAILS;
  // Membership rows cascade-delete with their User (see Membership's own
  // onDelete: Cascade on the user relation) — deleting users here already
  // removes every membership this file created.
  await prisma.portalUser.deleteMany({ where: { id: { in: createdPortalUserIds } } });
  await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
});

afterEach(() => {
  resetAuthMock();
});

function asPlatformAdmin() {
  setMockAuthUser({ id: randomUUID(), email: PLATFORM_ADMIN_TEST_EMAIL });
}

async function createUser(overrides: { name: string; email: string; createdAt?: Date; role?: "OWNER" | "ADMIN" | "MEMBER" }) {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: overrides.name,
      email: overrides.email,
      createdAt: overrides.createdAt,
      // The vestigial top-level User.role — set deliberately, only for
      // the "no User.role dependency" test below, to a value chosen to
      // visibly differ from that same test's real Membership.role.
      role: overrides.role,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createOrg(name: string) {
  const org = await prisma.organization.create({ data: { name, slug: `${MARKER}-${randomUUID().slice(0, 8)}` } });
  createdOrgIds.push(org.id);
  return org;
}

async function addMembership(userId: string, organizationId: string, role: "OWNER" | "ADMIN" | "MEMBER") {
  await prisma.membership.create({ data: { userId, organizationId, role } });
}

function baseParams(overrides: Partial<UserListParams> = {}): UserListParams {
  return { ...parseUserListParams({}), ...overrides };
}

describe("listUsers — search", () => {
  it("finds a user by a partial, case-insensitive match on name", async () => {
    const marker = `${MARKER}searchname`;
    await createUser({ name: `Ada ${marker} Lovelace`, email: `${randomUUID().slice(0, 8)}@example-marker-domain.test` });

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker.toUpperCase() }));

    expect(result.total).toBe(1);
    expect(result.users[0].name).toContain(marker);
  });

  it("finds a user by a partial, case-insensitive match on email", async () => {
    const marker = `${MARKER}searchemail`;
    await createUser({ name: "Grace Hopper", email: `${marker}@example-marker-domain.test` });

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker.toUpperCase() }));

    expect(result.total).toBe(1);
    expect(result.users[0].email).toBe(`${marker}@example-marker-domain.test`);
  });

  it("a search term matching nothing returns an empty, non-throwing result", async () => {
    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: `${MARKER}-nothing-matches-this-${randomUUID()}` }));
    expect(result).toEqual({ users: [], total: 0 });
  });
});

describe("listUsers — sort", () => {
  it("name ascending orders alphabetically", async () => {
    const marker = `${MARKER}sortname`;
    await createUser({ name: `${marker}-Zed`, email: `${randomUUID().slice(0, 8)}@example-marker-domain.test` });
    await createUser({ name: `${marker}-Amy`, email: `${randomUUID().slice(0, 8)}@example-marker-domain.test` });

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker, sortField: "name", sortDir: "asc" }));

    expect(result.users.map((u) => u.name)).toEqual([`${marker}-Amy`, `${marker}-Zed`]);
  });

  it("createdAt newest-first orders by real timestamp, not insertion order", async () => {
    const marker = `${MARKER}sortcreated`;
    const now = Date.now();
    await createUser({
      name: `${marker}-older`,
      email: `${randomUUID().slice(0, 8)}@example-marker-domain.test`,
      createdAt: new Date(now - 2000),
    });
    await createUser({
      name: `${marker}-newer`,
      email: `${randomUUID().slice(0, 8)}@example-marker-domain.test`,
      createdAt: new Date(now - 1000),
    });

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker, sortField: "createdAt", sortDir: "desc" }));

    expect(result.users.map((u) => u.name)).toEqual([`${marker}-newer`, `${marker}-older`]);
  });

  it("createdAt oldest-first is the exact reverse", async () => {
    const marker = `${MARKER}sortcreatedasc`;
    const now = Date.now();
    await createUser({
      name: `${marker}-older`,
      email: `${randomUUID().slice(0, 8)}@example-marker-domain.test`,
      createdAt: new Date(now - 2000),
    });
    await createUser({
      name: `${marker}-newer`,
      email: `${randomUUID().slice(0, 8)}@example-marker-domain.test`,
      createdAt: new Date(now - 1000),
    });

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker, sortField: "createdAt", sortDir: "asc" }));

    expect(result.users.map((u) => u.name)).toEqual([`${marker}-older`, `${marker}-newer`]);
  });
});

describe("listUsers — pagination", () => {
  it("is bounded to PAGE_SIZE per page, with the remainder on page 2, and no overlap", async () => {
    const marker = `${MARKER}paginate`;
    const totalCreated = PAGE_SIZE + 3;
    for (let i = 0; i < totalCreated; i++) {
      await createUser({ name: `${marker}-${String(i).padStart(2, "0")}`, email: `${randomUUID().slice(0, 8)}@example-marker-domain.test` });
    }

    asPlatformAdmin();
    const page1 = await listUsers(baseParams({ q: marker, page: 1 }));
    const page2 = await listUsers(baseParams({ q: marker, page: 2 }));

    expect(page1.total).toBe(totalCreated);
    expect(page1.users).toHaveLength(PAGE_SIZE);
    expect(page2.total).toBe(totalCreated);
    expect(page2.users).toHaveLength(totalCreated - PAGE_SIZE);

    const page1Ids = new Set(page1.users.map((u) => u.id));
    const overlap = page2.users.filter((u) => page1Ids.has(u.id));
    expect(overlap).toEqual([]);
  });
});

describe("listUsers — membership pairing and multi-organization display", () => {
  it("a single-org user shows exactly that organization and that membership's own role", async () => {
    const marker = `${MARKER}singleorg`;
    const org = await createOrg(`${marker}-Org`);
    const user = await createUser({ name: `${marker}-User`, email: `${randomUUID().slice(0, 8)}@example-marker-domain.test` });
    await addMembership(user.id, org.id, "ADMIN");

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker }));

    expect(result.users).toHaveLength(1);
    expect(result.users[0].memberships).toEqual([{ organizationId: org.id, organizationName: `${marker}-Org`, role: "ADMIN" }]);
  });

  it("a multi-org user shows every membership, each paired with its own organization's own role — never cross-matched", async () => {
    const marker = `${MARKER}multiorg`;
    const orgA = await createOrg(`${marker}-OrgA`);
    const orgB = await createOrg(`${marker}-OrgB`);
    const user = await createUser({ name: `${marker}-User`, email: `${randomUUID().slice(0, 8)}@example-marker-domain.test` });
    await addMembership(user.id, orgA.id, "ADMIN");
    await addMembership(user.id, orgB.id, "MEMBER");

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker }));

    expect(result.users).toHaveLength(1);
    const memberships = result.users[0].memberships;
    expect(memberships).toHaveLength(2);
    expect(memberships).toContainEqual({ organizationId: orgA.id, organizationName: `${marker}-OrgA`, role: "ADMIN" });
    expect(memberships).toContainEqual({ organizationId: orgB.id, organizationName: `${marker}-OrgB`, role: "MEMBER" });
    // The specific wrong-pairing this test guards against: OrgA's own
    // role leaking onto OrgB or vice versa.
    expect(memberships).not.toContainEqual({ organizationId: orgA.id, organizationName: `${marker}-OrgA`, role: "MEMBER" });
    expect(memberships).not.toContainEqual({ organizationId: orgB.id, organizationName: `${marker}-OrgB`, role: "ADMIN" });
  });

  it("a zero-membership user does not crash, and returns an empty memberships array", async () => {
    const marker = `${MARKER}zeromembership`;
    await createUser({ name: `${marker}-User`, email: `${randomUUID().slice(0, 8)}@example-marker-domain.test` });

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker }));

    expect(result.users).toHaveLength(1);
    expect(result.users[0].memberships).toEqual([]);
  });
});

describe("listUsers — no User.role dependency (the vestigial top-level field must never be read)", () => {
  it("a user whose top-level User.role disagrees with their real Membership.role reports the Membership role, never User.role", async () => {
    const marker = `${MARKER}norolefield`;
    const org = await createOrg(`${marker}-Org`);
    // Deliberately contradictory: User.role says OWNER, the real
    // Membership.role says MEMBER — if listUsers() ever read User.role by
    // mistake, this test's own assertion below would fail.
    const user = await createUser({
      name: `${marker}-User`,
      email: `${randomUUID().slice(0, 8)}@example-marker-domain.test`,
      role: "OWNER",
    });
    await addMembership(user.id, org.id, "MEMBER");

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker }));

    expect(result.users[0].memberships).toEqual([{ organizationId: org.id, organizationName: `${marker}-Org`, role: "MEMBER" }]);
  });
});

describe("listUsers — exposes only the intended safe fields", () => {
  it("a user row contains exactly {id, name, email, createdAt, memberships} — no other field", async () => {
    const marker = `${MARKER}shape`;
    await createUser({ name: `${marker}-User`, email: `${randomUUID().slice(0, 8)}@example-marker-domain.test` });

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker }));

    expect(Object.keys(result.users[0]).sort()).toEqual(["createdAt", "email", "id", "memberships", "name"]);
  });

  it("a membership entry contains exactly {organizationId, organizationName, role} — no other field", async () => {
    const marker = `${MARKER}membershipshape`;
    const org = await createOrg(`${marker}-Org`);
    const user = await createUser({ name: `${marker}-User`, email: `${randomUUID().slice(0, 8)}@example-marker-domain.test` });
    await addMembership(user.id, org.id, "OWNER");

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker }));

    expect(Object.keys(result.users[0].memberships[0]).sort()).toEqual(["organizationId", "organizationName", "role"]);
  });
});

describe("listUsers — no PortalUser data leaks into this list", () => {
  it("a PortalUser sharing this test's marker email never appears in listUsers' results", async () => {
    const marker = `${MARKER}portaluserleak`;
    const org = await createOrg(`${marker}-Org`);
    // Deliberately does NOT contain `marker` in its own name/email — this
    // Client-owning User is real Users Explorer data (correctly excluded
    // from this test's own marker-scoped search), not the thing under
    // test; only the PortalUser below carries the marker.
    const clientOwner = await createUser({
      name: `Client Owner ${randomUUID().slice(0, 8)}`,
      email: `${randomUUID().slice(0, 8)}@example-marker-domain.test`,
    });
    const client = await prisma.client.create({ data: { name: `${marker}-Client`, organizationId: org.id, userId: clientOwner.id } });
    createdClientIds.push(client.id);
    const portalUser = await prisma.portalUser.create({
      data: { id: randomUUID(), clientId: client.id, name: `${marker}-Portal-Contact`, email: `${marker}@example-marker-domain.test` },
    });
    createdPortalUserIds.push(portalUser.id);

    asPlatformAdmin();
    const result = await listUsers(baseParams({ q: marker }));

    expect(result.total).toBe(0);
    expect(result.users).toEqual([]);
  });
});
