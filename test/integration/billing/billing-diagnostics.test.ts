import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Same TEST_MODE-forcing technique
// test/integration/billing/checkout-portal.test.ts already established —
// resolves getBillingProviderAdapter() to the real MockBillingProvider
// (kind "mock", not "unconfigured"), so both actions' own try/catch
// around the real provider call is genuinely reached.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/test-mode", () => ({ TEST_MODE: true }));

// The one additional boundary this file mocks beyond checkout-portal.test.ts:
// createMockBillingProvider() itself, wrapped (not replaced) so every
// existing call still resolves to the real adapter by default — only the
// specific tests below that need a genuine provider throw override the
// return value for exactly one call via mockReturnValueOnce, spreading in
// every other real method unchanged.
vi.mock("@/lib/billing/provider/mock-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/provider/mock-provider")>();
  return { ...actual, createMockBillingProvider: vi.fn(actual.createMockBillingProvider) };
});

import { prisma } from "@/lib/prisma";
import { requestPlanChangeAction, manageSubscriptionAction } from "@/app/(dashboard)/settings/billing/actions";
import { createMockBillingProvider, deriveMockCustomerId } from "@/lib/billing/provider/mock-provider";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { actAs, resetAuthMock } from "../../support/auth-mock";
import { RedirectSignal, resetNavigationMock } from "../../support/navigation-mock";

/**
 * Production Observability Correction 2 — bounded diagnostic for genuine
 * external Paddle/billing provider-call failures. Runs against the real
 * repository database harness (PGlite), reusing
 * test/integration/billing/checkout-portal.test.ts's own established
 * TEST_MODE/mock-provider conventions exactly. This file adds diagnostic
 * assertions on top of that already-proven checkout/portal behavior; it
 * does not re-prove authorization, plan validation, or the mock
 * redirect/URL contract, which the existing file already covers in full.
 */

const mockedCreateProvider = vi.mocked(createMockBillingProvider);

const EVENT_MESSAGE = "[billing] Provider session creation failed.";

// Deliberately identifiable marker values planted in every corner a raw
// provider error could theoretically leak from — the same technique
// PR #111's test/integration/invoices/issue-diagnostics.test.ts already
// established.
const MARKERS = {
  message: "MARKER_MESSAGE_c4e9",
  stack: "MARKER_STACK_71bd",
  cause: "MARKER_CAUSE_02fa",
  digest: "MARKER_DIGEST_9a17",
  code: "MARKER_CODE_paddle_error",
  id: "11111111-2222-3333-4444-555555555555",
  email: "marker-user@example-marker-domain.test",
  url: "https://marker-checkout.example.test/marker-session",
  token: "sk_marker_9f3a5e02b71cd",
};

function markerError(): Error {
  const err = Object.assign(new Error(MARKERS.message), {
    digest: MARKERS.digest,
    cause: MARKERS.cause,
    code: MARKERS.code,
    name: "PaddleAdapterError",
    organizationId: MARKERS.id,
    customerId: MARKERS.id,
    subscriptionId: MARKERS.id,
    email: MARKERS.email,
    url: MARKERS.url,
    apiKey: MARKERS.token,
  });
  err.stack = MARKERS.stack;
  return err;
}

function assertNoMarkers(consoleErrorSpy: ReturnType<typeof vi.spyOn>) {
  const serialized = JSON.stringify(consoleErrorSpy.mock.calls);
  for (const marker of Object.values(MARKERS)) {
    expect(serialized).not.toContain(marker);
  }
}

describe("Billing provider-call diagnostics", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterEach(async () => {
    resetAuthMock();
    resetNavigationMock();
    mockedCreateProvider.mockClear();
    vi.restoreAllMocks();
    await prisma.subscription.deleteMany({ where: { organizationId: fixtures.orgA.id } });
  });

  afterAll(async () => {
    await cleanupTestData(fixtures);
  });

  describe("requestPlanChangeAction — checkout", () => {
    it("a successful checkout session emits no diagnostic", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      actAs(fixtures.owner, fixtures.orgA.id);

      let caught: unknown;
      try {
        await requestPlanChangeAction("PRO");
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(RedirectSignal);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("a genuine provider throw (real, marker-laden Error) logs the fixed diagnostic exactly once with operation: checkout, the existing generic response is unchanged, and no marker ever reaches the logged call", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const real = mockedCreateProvider();
      mockedCreateProvider.mockReturnValueOnce({
        ...real,
        createCheckoutSession: vi.fn().mockRejectedValue(markerError()),
      });
      actAs(fixtures.owner, fixtures.orgA.id);

      const result = await requestPlanChangeAction("PRO");

      expect(result).toEqual({ ok: false, message: "Something went wrong starting checkout. Please try again." });
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { operation: "checkout" });
      expect(Object.keys(consoleErrorSpy.mock.calls[0][1] as object)).toEqual(["operation"]);
      assertNoMarkers(consoleErrorSpy);

      // No Subscription row written by the failed attempt.
      const subscription = await prisma.subscription.findUnique({ where: { organizationId: fixtures.orgA.id } });
      expect(subscription).toBeNull();
    });

    it("a provider throw is never retried — the provider method is called exactly once", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const real = mockedCreateProvider();
      const checkoutSpy = vi.fn().mockRejectedValue(markerError());
      mockedCreateProvider.mockReturnValueOnce({ ...real, createCheckoutSession: checkoutSpy });
      actAs(fixtures.owner, fixtures.orgA.id);

      await requestPlanChangeAction("PRO");

      expect(checkoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("manageSubscriptionAction — customer portal", () => {
    it("a successful customer-portal session emits no diagnostic", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await prisma.subscription.create({
        data: {
          organizationId: fixtures.orgA.id,
          planKey: "STARTER",
          status: "ACTIVE",
          providerCustomerId: deriveMockCustomerId(fixtures.orgA.id),
          trialStartedAt: new Date(),
          trialEndsAt: new Date(),
        },
      });
      actAs(fixtures.owner, fixtures.orgA.id);

      let caught: unknown;
      try {
        await manageSubscriptionAction();
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(RedirectSignal);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("a genuine provider throw (real, marker-laden Error) logs the fixed diagnostic exactly once with operation: customer_portal, the existing generic response is unchanged, and no marker ever reaches the logged call", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await prisma.subscription.create({
        data: {
          organizationId: fixtures.orgA.id,
          planKey: "STARTER",
          status: "ACTIVE",
          providerCustomerId: deriveMockCustomerId(fixtures.orgA.id),
          trialStartedAt: new Date(),
          trialEndsAt: new Date(),
        },
      });
      const real = mockedCreateProvider();
      mockedCreateProvider.mockReturnValueOnce({
        ...real,
        createCustomerPortalSession: vi.fn().mockRejectedValue(markerError()),
      });
      actAs(fixtures.owner, fixtures.orgA.id);

      const result = await manageSubscriptionAction();

      expect(result).toEqual({ ok: false, message: "Something went wrong opening the billing portal. Please try again." });
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { operation: "customer_portal" });
      expect(Object.keys(consoleErrorSpy.mock.calls[0][1] as object)).toEqual(["operation"]);
      assertNoMarkers(consoleErrorSpy);
    });
  });

  describe("blocked before ever reaching the provider adapter", () => {
    it("a request blocked by authorization/plan-validation (never reaching adapter.createCheckoutSession) emits no diagnostic", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      actAs(fixtures.admin, fixtures.orgA.id);

      const result = await requestPlanChangeAction("PRO");

      expect(result).toEqual({ ok: false, message: "Only the organization owner can manage billing." });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
