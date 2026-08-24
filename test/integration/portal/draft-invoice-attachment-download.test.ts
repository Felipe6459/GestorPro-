import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/portal/attachments/[id]/download/route";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { setMockAuthUser, resetAuthMock } from "../../support/auth-mock";
import { resetNavigationMock } from "../../support/navigation-mock";
import { resetStorageMock } from "../../support/storage-mock";

/**
 * Client Portal Audit Finding 1 — route-level proof, complementing
 * authorization.test.ts's pure-function matrix. Calls the real,
 * unmodified route handler directly (matching download-analytics-
 * failure.test.ts's own established pattern) with real seeded Prisma
 * data and the real getCurrentPortalUser()/verifyPortalAttachmentAccess()
 * authorization logic — only Supabase Auth and the signed-URL step are
 * mocked (the same two external boundaries every other file in this
 * directory mocks), and recordPortalDownloadRequest is the real,
 * unmocked helper, so a genuine PortalDownloadRequest row (or the real
 * absence of one) is what's actually asserted.
 */

function downloadRequest(attachmentId: string) {
  return GET(new Request(`http://localhost/api/portal/attachments/${attachmentId}/download`), {
    params: Promise.resolve({ id: attachmentId }),
  });
}

describe("Client Portal Audit Finding 1 — attachment download route denies a DRAFT Invoice's attachment", () => {
  let fixtures: TestFixtures;
  let draftInvoice: { id: string };
  let sentInvoice: { id: string };
  let draftAttachment: { id: string };
  let sentAttachment: { id: string };

  beforeAll(async () => {
    fixtures = await seedTestData();
    const common = {
      projectId: fixtures.project.id,
      clientId: fixtures.clientA.id,
      organizationId: fixtures.orgA.id,
      issueDate: new Date(),
    };
    draftInvoice = await prisma.invoice.create({
      data: { ...common, invoiceNumber: "FINDING1-ROUTE-DRAFT-1", amount: "70.00", status: "DRAFT" },
    });
    sentInvoice = await prisma.invoice.create({
      data: { ...common, invoiceNumber: "FINDING1-ROUTE-SENT-1", amount: "80.00", status: "SENT" },
    });
    draftAttachment = await prisma.attachment.create({
      data: {
        entityType: "INVOICE",
        entityId: draftInvoice.id,
        organizationId: fixtures.orgA.id,
        originalName: "draft-invoice-file.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storageBucket: "attachments",
        storagePath: `finding-1-route/${randomUUID()}.pdf`,
        uploadedById: fixtures.owner.id,
      },
    });
    sentAttachment = await prisma.attachment.create({
      data: {
        entityType: "INVOICE",
        entityId: sentInvoice.id,
        organizationId: fixtures.orgA.id,
        originalName: "sent-invoice-file.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storageBucket: "attachments",
        storagePath: `finding-1-route/${randomUUID()}.pdf`,
        uploadedById: fixtures.owner.id,
      },
    });
  });

  afterEach(async () => {
    resetAuthMock();
    resetNavigationMock();
    resetStorageMock();
    await prisma.portalDownloadRequest.deleteMany({ where: { organizationId: fixtures.orgA.id } });
  });

  afterAll(async () => {
    await prisma.attachment.deleteMany({ where: { id: { in: [draftAttachment.id, sentAttachment.id] } } });
    await prisma.invoice.deleteMany({ where: { id: { in: [draftInvoice.id, sentInvoice.id] } } });
    await cleanupTestData(fixtures);
  });

  it("10-13. a DRAFT Invoice's attachment: the same generic denial response as any inaccessible attachment, no signed URL, no analytics row, no disclosure of any raw id/status/path", async () => {
    setMockAuthUser({ id: fixtures.portalUser.id, email: fixtures.portalUser.email });

    const response = await downloadRequest(draftAttachment.id);
    const body = await response.text();

    // 10. Identical to the route's own existing generic denial — same
    // status, same fixed body, used for every other "not accessible"
    // reason (nonexistent id, cross-client, cross-organization).
    expect(response.status).toBe(404);
    expect(body).toBe("Not found");

    // 11. No redirect to any signed Storage URL was ever issued.
    expect(response.headers.get("location")).toBeNull();

    // 12. No PortalDownloadRequest row exists for this organization at all
    // — the route never reaches the analytics call once access is denied.
    const rows = await prisma.portalDownloadRequest.findMany({ where: { organizationId: fixtures.orgA.id } });
    expect(rows).toHaveLength(0);

    // 13. Non-disclosure — the generic body/status carry no raw
    // attachment id, Invoice id/number, status, client data, or storage
    // path, regardless of what this specific denial's real cause was.
    expect(body).not.toContain(draftAttachment.id);
    expect(body).not.toContain(draftInvoice.id);
    expect(body).not.toContain("FINDING1-ROUTE-DRAFT-1");
    expect(body).not.toContain("DRAFT");
    expect(body).not.toContain(fixtures.clientA.id);
    expect(body).not.toContain("attachments/");
  });

  it("14. control: a SENT Invoice's attachment still reaches the existing successful signed-download behavior and records analytics exactly as before", async () => {
    setMockAuthUser({ id: fixtures.portalUser.id, email: fixtures.portalUser.email });

    const response = await downloadRequest(sentAttachment.id);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).not.toBeNull();

    const rows = await prisma.portalDownloadRequest.findMany({ where: { organizationId: fixtures.orgA.id } });
    expect(rows).toHaveLength(1);
  });
});
