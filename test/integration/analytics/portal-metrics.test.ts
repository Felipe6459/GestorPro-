import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPortalOverview, getPortalActivityCounts } from "@/lib/analytics/queries/portal-metrics";
import { testEmail, testSlug } from "../../support/run-id";

async function createOrgWithOwner(label: string) {
  const runSuffix = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({
    data: { id: randomUUID(), email: testEmail(`analytics-pm-${label}`, "test.local", runSuffix), name: `Analytics ${label}` },
  });
  const org = await prisma.organization.create({
    data: { name: `Analytics Portal Metrics Org ${label}`, slug: testSlug(`analytics-pm-${label}`, runSuffix) },
  });
  await prisma.membership.create({ data: { userId: owner.id, organizationId: org.id, role: "OWNER" } });
  return { owner, org };
}

describe("getPortalOverview", () => {
  let org: Awaited<ReturnType<typeof createOrgWithOwner>>;
  let clientWithPortal: { id: string };
  let clientWithoutPortal: { id: string };

  beforeAll(async () => {
    org = await createOrgWithOwner("A");
    clientWithPortal = await prisma.client.create({ data: { name: "Client Portal", userId: org.owner.id, organizationId: org.org.id } });
    clientWithoutPortal = await prisma.client.create({ data: { name: "Client No Portal", userId: org.owner.id, organizationId: org.org.id } });

    await prisma.portalUser.create({
      data: { id: randomUUID(), clientId: clientWithPortal.id, email: testEmail("portal-pm-1", "test.local", randomUUID().slice(0, 8)), name: "Portal One" },
    });

    // Attachments: one on the portal-enabled Client, one on a Project under it, one on the no-portal Client.
    const project = await prisma.project.create({ data: { name: "Portal Project", clientId: clientWithPortal.id, ownerId: org.owner.id, organizationId: org.org.id } });
    await prisma.attachment.create({
      data: { organizationId: org.org.id, entityType: "CLIENT", entityId: clientWithPortal.id, storageBucket: "attachments", storagePath: `test/${randomUUID()}`, originalName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 },
    });
    await prisma.attachment.create({
      data: { organizationId: org.org.id, entityType: "PROJECT", entityId: project.id, storageBucket: "attachments", storagePath: `test/${randomUUID()}`, originalName: "b.pdf", mimeType: "application/pdf", sizeBytes: 10 },
    });
    await prisma.attachment.create({
      data: { organizationId: org.org.id, entityType: "CLIENT", entityId: clientWithoutPortal.id, storageBucket: "attachments", storagePath: `test/${randomUUID()}`, originalName: "c.pdf", mimeType: "application/pdf", sizeBytes: 10 },
    });

    // Invoices: one for the portal client, one for the non-portal client.
    await prisma.invoice.create({ data: { invoiceNumber: "INV-P-1", amount: "10.00", clientId: clientWithPortal.id, projectId: project.id, organizationId: org.org.id } });
    const project2 = await prisma.project.create({ data: { name: "No Portal Project", clientId: clientWithoutPortal.id, ownerId: org.owner.id, organizationId: org.org.id } });
    await prisma.invoice.create({ data: { invoiceNumber: "INV-NP-1", amount: "10.00", clientId: clientWithoutPortal.id, projectId: project2.id, organizationId: org.org.id } });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { organizationId: org.org.id } });
    await prisma.client.deleteMany({ where: { organizationId: org.org.id } }); // cascades Project, PortalUser
    await prisma.organization.delete({ where: { id: org.org.id } });
    await prisma.user.delete({ where: { id: org.owner.id } });
  });

  it("totalPortalUsers counts only this organization's PortalUser rows", async () => {
    const overview = await getPortalOverview(prisma, org.org.id);
    expect(overview.totalPortalUsers).toBe(1);
  });

  it("portalAdoptionRate is the percent of Clients with at least one PortalUser", async () => {
    const overview = await getPortalOverview(prisma, org.org.id);
    expect(overview.portalAdoptionRate).toBe(50); // 1 of 2 clients
  });

  it("documentsAvailable counts Client-level AND Project-level attachments reachable by a portal identity, never the non-portal client's", async () => {
    const overview = await getPortalOverview(prisma, org.org.id);
    expect(overview.documentsAvailable).toBe(2); // client-level + project-level, both under clientWithPortal
  });

  it("invoicesVisible counts only invoices belonging to a Client with portal access", async () => {
    const overview = await getPortalOverview(prisma, org.org.id);
    expect(overview.invoicesVisible).toBe(1);
  });

  it("a fresh organization with no clients at all returns all zeros, portalAdoptionRate 0 (never NaN)", async () => {
    const { owner, org: freshOrg } = await createOrgWithOwner("empty");
    const overview = await getPortalOverview(prisma, freshOrg.id);
    expect(overview).toEqual({ totalPortalUsers: 0, portalAdoptionRate: 0, documentsAvailable: 0, invoicesVisible: 0 });
    await prisma.organization.delete({ where: { id: freshOrg.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });

  it("never leaks another organization's portal data", async () => {
    const { owner: otherOwner, org: otherOrg } = await createOrgWithOwner("isolated");
    const overview = await getPortalOverview(prisma, otherOrg.id);
    expect(overview.totalPortalUsers).toBe(0);
    expect(overview.documentsAvailable).toBe(0);
    await prisma.organization.delete({ where: { id: otherOrg.id } });
    await prisma.user.delete({ where: { id: otherOwner.id } });
  });
});

describe("getPortalActivityCounts", () => {
  let org: Awaited<ReturnType<typeof createOrgWithOwner>>;
  const bounds = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-08-12T00:00:00.000Z") };
  const previousBounds = { start: new Date("2026-07-21T00:00:00.000Z"), end: new Date("2026-08-01T00:00:00.000Z") };

  beforeAll(async () => {
    org = await createOrgWithOwner("counts");
    await prisma.activity.create({
      data: { organizationId: org.org.id, actorId: null, entityType: "PORTAL_USER", entityId: randomUUID(), action: "PORTAL_INVITATION_ACCEPTED", createdAt: new Date("2026-08-05T00:00:00.000Z") },
    });
    await prisma.activity.create({
      data: { organizationId: org.org.id, actorId: org.owner.id, entityType: "PORTAL_USER", entityId: randomUUID(), action: "PORTAL_INVITATION_SENT", createdAt: new Date("2026-08-06T00:00:00.000Z") },
    });
    // Outside the window entirely.
    await prisma.activity.create({
      data: { organizationId: org.org.id, actorId: null, entityType: "PORTAL_USER", entityId: randomUUID(), action: "PORTAL_INVITATION_ACCEPTED", createdAt: new Date("2020-01-01T00:00:00.000Z") },
    });
    // Non-portal Activity — must never be counted in portalRelatedActivity.
    await prisma.activity.create({
      data: { organizationId: org.org.id, actorId: org.owner.id, entityType: "CLIENT", entityId: randomUUID(), action: "CREATED", createdAt: new Date("2026-08-05T00:00:00.000Z") },
    });
  });

  afterAll(async () => {
    await prisma.activity.deleteMany({ where: { organizationId: org.org.id } });
    await prisma.organization.delete({ where: { id: org.org.id } });
    await prisma.user.delete({ where: { id: org.owner.id } });
  });

  it("invitationsAccepted counts PORTAL_INVITATION_ACCEPTED within bounds, with a real GrowthMetric shape", async () => {
    const counts = await getPortalActivityCounts(prisma, org.org.id, bounds, previousBounds);
    expect(counts.invitationsAccepted.currentPeriodCount).toBe(1);
    expect(counts.invitationsAccepted.previousPeriodCount).toBe(0);
    expect(counts.invitationsAccepted.changePercent).toBeNull();
  });

  it("portalRelatedActivity counts every PORTAL_USER-entityType Activity in the window, never a non-portal one", async () => {
    const counts = await getPortalActivityCounts(prisma, org.org.id, bounds, previousBounds);
    expect(counts.portalRelatedActivity).toBe(2); // accepted + sent, both PORTAL_USER entityType, both in-window
  });
});
