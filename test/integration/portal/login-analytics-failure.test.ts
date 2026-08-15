import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { portalLogin } from "@/app/portal/login/actions";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { setMockSignInConfig, resetAuthMock } from "../../support/auth-mock";
import { RedirectSignal, resetNavigationMock } from "../../support/navigation-mock";

/**
 * Portal Analytics persistence foundation (docs/analytics-architecture.md
 * §12, Slice 1) — isolated in its own file (rather than a case inside
 * login.test.ts) specifically so this one file's module-level mock of the
 * write-helper never affects login.test.ts's own real-write assertions.
 * recordPortalLogin() already proves its own internal try/catch never
 * throws (test/integration/portal/analytics-events.test.ts); this proves
 * the one thing that test can't: that a helper failure genuinely never
 * blocks the real, user-facing login success path.
 */
vi.mock("@/lib/client-portal/analytics-events", () => ({
  recordPortalLogin: vi.fn(async () => false),
}));

describe("portalLogin — a recordPortalLogin failure never blocks a successful login", () => {
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

  it("still redirects successfully even when the analytics write helper reports failure", async () => {
    setMockSignInConfig({
      kind: "success",
      user: { id: fixtures.portalUser.id, email: fixtures.portalUser.email },
    });

    const formData = new FormData();
    formData.set("email", fixtures.portalUser.email);
    formData.set("password", "correct-horse-battery-staple");

    await expect(portalLogin({ error: null }, formData)).rejects.toBeInstanceOf(RedirectSignal);
  });
});
