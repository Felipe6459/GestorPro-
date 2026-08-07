import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOrganizationAnalytics } from "@/lib/analytics/services/analytics-service";
import { AnalyticsAccessError } from "@/lib/analytics/authorization";
import { testEmail, testSlug } from "../../support/run-id";

const NOW = new Date("2026-08-12T15:30:00.000Z");

async function createOrgWithOwner(label: string) {
  const runSuffix = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({
    data: { id: randomUUID(), email: testEmail(`analytics-svc-${label}`, "test.local", runSuffix), name: `Analytics ${label}` },
  });
  const org = await prisma.organization.create({
    data: { name: `Analytics Service Org ${label}`, slug: testSlug(`analytics-svc-${label}`, runSuffix) },
  });
  await prisma.membership.create({ data: { userId: owner.id, organizationId: org.id, role: "OWNER" } });
  return { owner, org };
}

describe("getOrganizationAnalytics", () => {
  let org: Awaited<ReturnType<typeof createOrgWithOwner>>;

  beforeAll(async () => {
    org = await createOrgWithOwner("A");
    await prisma.client.create({ data: { name: "Service Client", userId: org.owner.id, organizationId: org.org.id } });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { organizationId: org.org.id } });
    await prisma.client.deleteMany({ where: { organizationId: org.org.id } });
    await prisma.organization.delete({ where: { id: org.org.id } });
    await prisma.user.delete({ where: { id: org.owner.id } });
  });

  it("MEMBER is denied with AnalyticsAccessError, before any query runs", async () => {
    await expect(getOrganizationAnalytics(org.org.id, "MEMBER", "last30Days", NOW)).rejects.toThrow(AnalyticsAccessError);
  });

  it("OWNER receives a full snapshot with every metric group present", async () => {
    const snapshot = await getOrganizationAnalytics(org.org.id, "OWNER", "last30Days", NOW);

    expect(snapshot.organizationId).toBe(org.org.id);
    expect(snapshot.timeRange).toBe("last30Days");
    expect(snapshot.computedAt).toEqual(NOW);
    expect(snapshot.organization.totalClients).toBe(1);
    expect(snapshot.activity).toEqual({ createdToday: 0, createdThisWeek: 0, createdThisMonth: 0 });
    expect(snapshot.completion.taskCompletionRate).toBe(0);
    expect(snapshot.completion.invoiceCompletionRate).toBe(0);
    expect(snapshot.growth.clientGrowth.currentPeriodCount).toBe(1);
    expect(typeof snapshot.onboarding.percent).toBe("number");
  });

  it("ADMIN also receives a full snapshot (not just OWNER)", async () => {
    const snapshot = await getOrganizationAnalytics(org.org.id, "ADMIN", "last30Days", NOW);
    expect(snapshot.organization.totalClients).toBe(1);
  });

  it("billing metrics fall back to LEGACY when no Subscription row exists", async () => {
    const snapshot = await getOrganizationAnalytics(org.org.id, "OWNER", "last30Days", NOW);
    expect(snapshot.billing.planKey).toBe("LEGACY");
    expect(snapshot.billing.subscriptionStatus).toBe("LEGACY");
  });

  it("billing metrics reflect a real Subscription row when one exists", async () => {
    await prisma.subscription.create({
      data: { organizationId: org.org.id, planKey: "PRO", status: "ACTIVE", trialStartedAt: NOW, trialEndsAt: NOW },
    });
    const snapshot = await getOrganizationAnalytics(org.org.id, "OWNER", "last30Days", NOW);
    expect(snapshot.billing.planKey).toBe("PRO");
    expect(snapshot.billing.subscriptionStatus).toBe("ACTIVE");
    await prisma.subscription.deleteMany({ where: { organizationId: org.org.id } });
  });

  it("allTime falls back to the default growth window instead of throwing", async () => {
    const snapshot = await getOrganizationAnalytics(org.org.id, "OWNER", "allTime", NOW);
    expect(snapshot.timeRange).toBe("allTime");
    expect(snapshot.growth.clientGrowth.currentPeriodCount).toBe(1); // still finds the one client created "now"
  });

  it("is fully scoped to the given organization — never leaks another org's data", async () => {
    const { owner: otherOwner, org: otherOrg } = await createOrgWithOwner("B");
    const snapshot = await getOrganizationAnalytics(otherOrg.id, "OWNER", "last30Days", NOW);
    expect(snapshot.organization.totalClients).toBe(0);
    await prisma.organization.delete({ where: { id: otherOrg.id } });
    await prisma.user.delete({ where: { id: otherOwner.id } });
  });
});
