import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// See test/integration/billing/webhook.test.ts's own header comment for
// why this mock is required to exercise the real webhook route.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/test-mode", () => ({ TEST_MODE: true }));

import { prisma } from "@/lib/prisma";
import { requestPlanChangeAction, manageSubscriptionAction } from "@/app/(dashboard)/settings/billing/actions";
import { POST } from "@/app/api/billing/webhook/route";
import {
  buildMockWebhookRequest,
  deriveMockCustomerId,
  deriveMockSubscriptionId,
  mockPeriodEnd,
  MOCK_WEBHOOK_SIGNATURE_HEADER,
} from "@/lib/billing/provider/mock-provider";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { actAs, resetAuthMock } from "../../support/auth-mock";
import { RedirectSignal, resetNavigationMock } from "../../support/navigation-mock";

/**
 * Platform Admin Organization Suspension, PR 2 — the billing half of this
 * PR's owner decisions. requestPlanChangeAction/manageSubscriptionAction
 * both resolve their organization via getCurrentMembership(), which is
 * built on current-user.ts's resolveActiveOrganizationId — already
 * suspension-aware since PR 1. This file is a *regression* test proving
 * that inherited protection actually blocks both actions; it adds no new
 * enforcement code of its own (see this PR's own design decision: no
 * independent bypass was found, so no redundant explicit check was
 * added).
 *
 * Billing webhook processing must remain completely unaffected by
 * suspension (billing reconciliation, disputes, and provider-side
 * lifecycle events must keep working even for a suspended org) — proven
 * here against the real webhook route, mirroring test/integration/
 * billing/webhook.test.ts's own conventions.
 */

function toRequest(rawBody: string, signatureHeader: string): Request {
  return new Request("http://127.0.0.1/api/billing/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", [MOCK_WEBHOOK_SIGNATURE_HEADER]: signatureHeader },
    body: rawBody,
  });
}

let fixtures: TestFixtures;

beforeAll(async () => {
  fixtures = await seedTestData();
});

afterEach(async () => {
  resetAuthMock();
  resetNavigationMock();
  await prisma.organization.update({ where: { id: fixtures.orgA.id }, data: { suspendedAt: null } });
});

afterAll(async () => {
  await prisma.webhookEvent.deleteMany({ where: { organizationId: fixtures.orgA.id } });
  await prisma.notification.deleteMany({ where: { organizationId: fixtures.orgA.id } });
  await prisma.subscription.deleteMany({ where: { organizationId: fixtures.orgA.id } });
  await cleanupTestData(fixtures);
});

async function catchRedirect(fn: () => Promise<unknown>): Promise<RedirectSignal> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(RedirectSignal);
  return caught as RedirectSignal;
}

describe("Billing self-service is blocked for a suspended organization (regression — inherited from PR 1's centralized resolver)", () => {
  it("requestPlanChangeAction: an OWNER of a suspended organization is redirected to /organization-unavailable, never reaching billing", async () => {
    await prisma.organization.update({ where: { id: fixtures.orgA.id }, data: { suspendedAt: new Date() } });
    actAs(fixtures.owner, fixtures.orgA.id);

    const signal = await catchRedirect(() => requestPlanChangeAction("STARTER"));
    expect(signal.url).toBe("/organization-unavailable");
  });

  it("manageSubscriptionAction: an OWNER of a suspended organization is redirected to /organization-unavailable, never reaching the billing portal", async () => {
    await prisma.organization.update({ where: { id: fixtures.orgA.id }, data: { suspendedAt: new Date() } });
    actAs(fixtures.owner, fixtures.orgA.id);

    const signal = await catchRedirect(() => manageSubscriptionAction());
    expect(signal.url).toBe("/organization-unavailable");
  });

  it("regression: an active organization's OWNER reaches real checkout, never the suspension redirect", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    // The test env's mock billing provider (TEST_MODE) genuinely redirects
    // to its own checkout URL — the point here is only that this is *not*
    // the /organization-unavailable redirect the suspended-org tests above
    // produce.
    const signal = await catchRedirect(() => requestPlanChangeAction("STARTER"));
    expect(signal.url).not.toBe("/organization-unavailable");
    expect(signal.url).toContain("/billing/mock/checkout");
  });
});

describe("Billing webhook processing is unaffected by suspension (regression)", () => {
  it("a valid, signed SUBSCRIPTION_ACTIVATED event still updates the Subscription row for a suspended organization", async () => {
    await prisma.organization.update({ where: { id: fixtures.orgA.id }, data: { suspendedAt: new Date() } });

    const now = new Date();
    const { rawBody, signatureHeader } = buildMockWebhookRequest({
      eventType: "SUBSCRIPTION_ACTIVATED",
      organizationId: fixtures.orgA.id,
      providerCustomerId: deriveMockCustomerId(fixtures.orgA.id),
      providerSubscriptionId: deriveMockSubscriptionId(fixtures.orgA.id),
      planKey: "STARTER",
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: mockPeriodEnd(now),
      cancelAtPeriodEnd: false,
      trialEnd: null,
      now,
      providerEventId: randomUUID(),
    });

    const response = await POST(toRequest(rawBody, signatureHeader));
    expect(response.status).toBe(200);

    const subscription = await prisma.subscription.findUnique({ where: { organizationId: fixtures.orgA.id } });
    expect(subscription?.status).toBe("ACTIVE");
    expect(subscription?.planKey).toBe("STARTER");

    // The webhook never touches suspendedAt — this PR's own owner
    // decision that suspension is orthogonal to billing lifecycle state.
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: fixtures.orgA.id }, select: { suspendedAt: true } });
    expect(org.suspendedAt).not.toBeNull();
  });
});
