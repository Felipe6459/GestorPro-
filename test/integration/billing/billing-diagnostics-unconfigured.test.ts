import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Deliberately does NOT mock @/lib/test-mode — matches
// test/integration/billing/actions.test.ts's own established pattern
// exactly, so getBillingProviderAdapter() resolves through the real,
// unmocked TEST_MODE (false in this test process) -> getPaddleProviderConfig()
// (no BILLING_* env configured) -> the real, genuine UnconfiguredBillingProvider.
// This is a separate file from billing-diagnostics.test.ts specifically
// because that file's own module-level `vi.mock("@/lib/test-mode", ...)`
// is hoisted and file-scoped — it cannot be toggled per-test, and this
// scenario structurally requires the real TEST_MODE resolution.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { requestPlanChangeAction, manageSubscriptionAction } from "@/app/(dashboard)/settings/billing/actions";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { actAs, resetAuthMock } from "../../support/auth-mock";

/**
 * Production Observability Correction 2 — proves the deliberate,
 * bounded "Paddle not configured" outcome (a normal configuration state,
 * not a thrown provider failure) never emits the new provider-failure
 * diagnostic, since it is intercepted by the `adapter.kind === "unconfigured"`
 * check before either action's own try/catch around the real provider
 * call is ever reached (confirmed directly from source in this
 * correction's own Phase 1 investigation).
 */
describe("Billing provider-call diagnostics — genuine unconfigured provider", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
    await prisma.subscription.create({
      data: {
        organizationId: fixtures.orgA.id,
        planKey: "STARTER",
        status: "ACTIVE",
        trialStartedAt: new Date(),
        trialEndsAt: new Date(),
      },
    });
  });

  afterEach(() => {
    resetAuthMock();
  });

  afterAll(async () => {
    await cleanupTestData(fixtures);
  });

  it("requestPlanChangeAction's genuine unconfigured-provider outcome emits no provider-failure diagnostic", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    actAs(fixtures.owner, fixtures.orgA.id);

    const result = await requestPlanChangeAction("PRO");

    expect(result).toEqual({ ok: false, message: "Billing provider is not configured." });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("manageSubscriptionAction's genuine unconfigured-provider outcome emits no provider-failure diagnostic", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    actAs(fixtures.owner, fixtures.orgA.id);

    const result = await manageSubscriptionAction();

    expect(result).toEqual({ ok: false, message: "Billing provider is not configured." });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
