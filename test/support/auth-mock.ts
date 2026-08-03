// Shared mutable state between test/integration/setup-mocks.ts's vi.mock()
// registrations and whatever integration test currently needs to "be"
// a particular authenticated identity. This is the ONLY thing mocked —
// everything downstream (getOrCreateUser, getCurrentMembership,
// getCurrentPortalUser, and every real Server Action built on top of them)
// runs unmocked, against the real Prisma-backed test database. Per the
// user's explicit constraint, Prisma itself is never mocked.

export type MockAuthUser = {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
};

let currentUser: MockAuthUser | null = null;

/** The identity the mocked Supabase client's auth.getUser() resolves to. */
export function setMockAuthUser(user: MockAuthUser | null): void {
  currentUser = user;
}

export function getMockAuthUser(): MockAuthUser | null {
  return currentUser;
}

/** In-memory cookie jar backing the mocked next/headers cookies(). */
const cookieStore = new Map<string, string>();

export function mockCookies() {
  return {
    get(name: string) {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      cookieStore.set(name, value);
    },
    delete(name: string) {
      cookieStore.delete(name);
    },
  };
}

export function resetMockCookies(): void {
  cookieStore.clear();
}

// Matches current-user.ts's own ACTIVE_ORG_COOKIE constant exactly. Real
// requests set this via the org switcher; tests must set it explicitly
// before acting as anyone other than an OWNER — resolveActiveOrganizationId
// only auto-resolves an org from a bare identity via an OWNER membership
// (getOrCreateOrganizationId), so an ADMIN/MEMBER fixture user with no
// cookie set would otherwise have a brand-new personal org silently
// auto-provisioned for them instead of resolving to the fixture org.
const ACTIVE_ORG_COOKIE = "active_organization_id";

export function setMockActiveOrganization(organizationId: string): void {
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId);
}

/** Call in afterEach — clears both the identity and the cookie jar so one test's "logged in as" state never leaks into the next. */
export function resetAuthMock(): void {
  currentUser = null;
  cookieStore.clear();
}

/** Convenience: "log in as" a fixture user, in the given organization. */
export function actAs(user: MockAuthUser, organizationId: string): void {
  setMockAuthUser(user);
  setMockActiveOrganization(organizationId);
}
