import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getPortalProject,
  getPortalInvoice,
  getPortalProjects,
  getPortalInvoices,
} from "@/lib/client-portal/queries";
import {
  getPortalClientAttachments,
  verifyPortalAttachmentAccess,
} from "@/lib/client-portal/attachments";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";

// These query/access functions are fully parameter-driven (clientId always
// passed explicitly, never resolved from a cookie internally) — no auth
// mocking needed at all, real Prisma end to end.

describe("Client Portal authorization — PortalUser A cannot see Client B's data", () => {
  let fixtures: TestFixtures;
  let projectB: { id: string };
  let invoiceB: { id: string };
  // fixtures.invoice is DRAFT and, since Invoice System Official Slice 5
  // (docs/invoicing-architecture.md §10), is correctly never Portal-visible
  // — these cross-client isolation proofs need an invoice that a
  // same-client lookup CAN resolve, so a dedicated SENT invoice for
  // Client A is used instead of relying on the fixed DRAFT-visibility bug.
  let visibleInvoiceA: { id: string };

  beforeAll(async () => {
    fixtures = await seedTestData();
    projectB = await prisma.project.create({
      data: {
        name: "Client B Project",
        clientId: fixtures.clientB.id,
        organizationId: fixtures.orgB.id,
        ownerId: fixtures.orgBOwner.id,
        status: "IN_PROGRESS",
      },
    });
    invoiceB = await prisma.invoice.create({
      data: {
        invoiceNumber: "INV-B-1",
        clientId: fixtures.clientB.id,
        projectId: projectB.id,
        organizationId: fixtures.orgB.id,
        amount: "200.00",
        status: "DRAFT",
        issueDate: new Date(),
      },
    });
    visibleInvoiceA = await prisma.invoice.create({
      data: {
        invoiceNumber: "INV-A-VISIBLE-1",
        clientId: fixtures.clientA.id,
        projectId: fixtures.project.id,
        organizationId: fixtures.orgA.id,
        amount: "300.00",
        status: "SENT",
        issueDate: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { id: { in: [invoiceB.id, visibleInvoiceA.id] } } });
    await prisma.project.deleteMany({ where: { id: projectB.id } });
    await cleanupTestData(fixtures);
  });

  it("getPortalProject: Client A's clientId cannot resolve Client B's project", async () => {
    const crossClient = await getPortalProject(fixtures.clientA.id, projectB.id);
    expect(crossClient).toBeNull();

    const ownProject = await getPortalProject(fixtures.clientA.id, fixtures.project.id);
    expect(ownProject?.id).toBe(fixtures.project.id);
  });

  it("getPortalInvoice: Client A's clientId cannot resolve Client B's invoice", async () => {
    const crossClient = await getPortalInvoice(fixtures.clientA.id, fixtures.orgA.id, invoiceB.id);
    expect(crossClient).toBeNull();

    const ownInvoice = await getPortalInvoice(fixtures.clientA.id, fixtures.orgA.id, visibleInvoiceA.id);
    expect(ownInvoice?.id).toBe(visibleInvoiceA.id);
  });

  it("getPortalProjects: never returns another Client's projects", async () => {
    const projects = await getPortalProjects(fixtures.clientA.id);
    expect(projects.some((p) => p.id === projectB.id)).toBe(false);
    expect(projects.some((p) => p.id === fixtures.project.id)).toBe(true);
  });

  it("getPortalInvoices: never returns another Client's invoices", async () => {
    const invoices = await getPortalInvoices(fixtures.clientA.id, fixtures.orgA.id, "all");
    expect(invoices.some((i) => i.id === invoiceB.id)).toBe(false);
    expect(invoices.some((i) => i.id === visibleInvoiceA.id)).toBe(true);
  });

  it("getPortalClientAttachments: scoped by clientId + organizationId together", async () => {
    const crossClient = await getPortalClientAttachments(fixtures.clientB.id, fixtures.orgA.id);
    expect(crossClient).toHaveLength(0);

    const ownClient = await getPortalClientAttachments(fixtures.clientA.id, fixtures.orgA.id);
    expect(ownClient.some((a) => a.id === fixtures.attachment.id)).toBe(true);
  });

  it("verifyPortalAttachmentAccess: denies a real Attachment row to the wrong Client identity", async () => {
    const attachment = await prisma.attachment.findUniqueOrThrow({ where: { id: fixtures.attachment.id } });

    const wrongIdentity = await verifyPortalAttachmentAccess(attachment, {
      clientId: fixtures.clientB.id,
      organizationId: fixtures.orgB.id,
    });
    expect(wrongIdentity).toBe(false);

    const rightIdentity = await verifyPortalAttachmentAccess(attachment, {
      clientId: fixtures.clientA.id,
      organizationId: fixtures.orgA.id,
    });
    expect(rightIdentity).toBe(true);
  });

  it("verifyPortalAttachmentAccess: fails closed for a mismatched organizationId even with the right clientId", async () => {
    const attachment = await prisma.attachment.findUniqueOrThrow({ where: { id: fixtures.attachment.id } });
    const result = await verifyPortalAttachmentAccess(attachment, {
      clientId: fixtures.clientA.id,
      organizationId: fixtures.orgB.id, // wrong org, right client — must still fail
    });
    expect(result).toBe(false);
  });
});

/**
 * Client Portal Audit Finding 1 — verifyPortalAttachmentAccess()'s INVOICE
 * branch previously checked only clientId + project.clientId, never the
 * Invoice's own status, so an attachment attached to a DRAFT (or any other
 * Portal-invisible) Invoice belonging to the correct Client still passed.
 * This is the exact matrix the corrected status predicate must satisfy:
 * every VISIBLE_PORTAL_STATUSES value allowed, DRAFT (and nothing else)
 * denied, with every existing cross-client/cross-organization/missing-
 * entity boundary from the describe block above still enforced, and
 * PROJECT/CLIENT attachment behavior completely unaffected.
 */
describe("Client Portal Audit Finding 1 — verifyPortalAttachmentAccess() Invoice-status boundary", () => {
  let fixtures: TestFixtures;
  let draftInvoice: { id: string };
  let sentInvoice: { id: string };
  let overdueInvoice: { id: string };
  let paidInvoice: { id: string };
  let cancelledInvoice: { id: string };
  let crossClientInvoice: { id: string; clientId: string };
  let allInvoiceIds: string[];
  const attachmentIds: string[] = [];

  async function createInvoiceAttachment(entityId: string, organizationId: string) {
    // storagePath is @unique — a fresh randomUUID() per call, since test 7
    // deliberately reuses the same sentInvoice.id as test 2's entityId.
    const attachment = await prisma.attachment.create({
      data: {
        entityType: "INVOICE",
        entityId,
        organizationId,
        originalName: "finding-1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storageBucket: "attachments",
        storagePath: `finding-1/${randomUUID()}.pdf`,
        uploadedById: fixtures.owner.id,
      },
    });
    attachmentIds.push(attachment.id);
    return attachment;
  }

  beforeAll(async () => {
    fixtures = await seedTestData();
    const common = {
      projectId: fixtures.project.id,
      clientId: fixtures.clientA.id,
      organizationId: fixtures.orgA.id,
      issueDate: new Date(),
    };

    draftInvoice = await prisma.invoice.create({
      data: { ...common, invoiceNumber: "FINDING1-DRAFT-1", amount: "10.00", status: "DRAFT" },
    });
    sentInvoice = await prisma.invoice.create({
      data: { ...common, invoiceNumber: "FINDING1-SENT-1", amount: "20.00", status: "SENT" },
    });
    overdueInvoice = await prisma.invoice.create({
      data: { ...common, invoiceNumber: "FINDING1-OVERDUE-1", amount: "30.00", status: "OVERDUE" },
    });
    paidInvoice = await prisma.invoice.create({
      data: { ...common, invoiceNumber: "FINDING1-PAID-1", amount: "40.00", status: "PAID", paidAt: new Date() },
    });
    cancelledInvoice = await prisma.invoice.create({
      data: { ...common, invoiceNumber: "FINDING1-CANCELLED-1", amount: "50.00", status: "CANCELLED" },
    });

    // A same-organization, different-Client SENT invoice — proves the
    // status predicate never substitutes for the existing clientId
    // boundary (a visible status alone must never be enough).
    const otherClient = await prisma.client.create({
      data: { name: "Finding 1 Other Client", organizationId: fixtures.orgA.id, userId: fixtures.owner.id },
    });
    crossClientInvoice = await prisma.invoice
      .create({
        data: {
          invoiceNumber: "FINDING1-CROSS-CLIENT-1",
          amount: "60.00",
          status: "SENT",
          issueDate: new Date(),
          projectId: fixtures.project.id,
          clientId: otherClient.id,
          organizationId: fixtures.orgA.id,
        },
      })
      .then((invoice) => ({ id: invoice.id, clientId: otherClient.id }));

    allInvoiceIds = [
      draftInvoice.id,
      sentInvoice.id,
      overdueInvoice.id,
      paidInvoice.id,
      cancelledInvoice.id,
      crossClientInvoice.id,
    ];
  });

  afterAll(async () => {
    await prisma.attachment.deleteMany({ where: { id: { in: attachmentIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: allInvoiceIds } } });
    await prisma.client.deleteMany({ where: { id: crossClientInvoice.clientId } });
    await cleanupTestData(fixtures);
  });

  const identity = () => ({ clientId: fixtures.clientA.id, organizationId: fixtures.orgA.id });

  it("1. DRAFT Invoice attachment, same client/organization — denied", async () => {
    const attachment = await createInvoiceAttachment(draftInvoice.id, fixtures.orgA.id);
    expect(await verifyPortalAttachmentAccess(attachment, identity())).toBe(false);
  });

  it("2. SENT Invoice attachment — allowed", async () => {
    const attachment = await createInvoiceAttachment(sentInvoice.id, fixtures.orgA.id);
    expect(await verifyPortalAttachmentAccess(attachment, identity())).toBe(true);
  });

  it("3. OVERDUE Invoice attachment — allowed", async () => {
    const attachment = await createInvoiceAttachment(overdueInvoice.id, fixtures.orgA.id);
    expect(await verifyPortalAttachmentAccess(attachment, identity())).toBe(true);
  });

  it("4. PAID Invoice attachment — allowed", async () => {
    const attachment = await createInvoiceAttachment(paidInvoice.id, fixtures.orgA.id);
    expect(await verifyPortalAttachmentAccess(attachment, identity())).toBe(true);
  });

  it("5. CANCELLED Invoice attachment — allowed", async () => {
    const attachment = await createInvoiceAttachment(cancelledInvoice.id, fixtures.orgA.id);
    expect(await verifyPortalAttachmentAccess(attachment, identity())).toBe(true);
  });

  it("6. Cross-client Invoice attachment (visible status, wrong Client) — denied", async () => {
    const attachment = await createInvoiceAttachment(crossClientInvoice.id, fixtures.orgA.id);
    expect(await verifyPortalAttachmentAccess(attachment, identity())).toBe(false);
  });

  it("7. Cross-organization Invoice attachment (visible status, right Client, wrong organizationId claimed) — denied", async () => {
    const attachment = await createInvoiceAttachment(sentInvoice.id, fixtures.orgA.id);
    const result = await verifyPortalAttachmentAccess(attachment, {
      clientId: fixtures.clientA.id,
      organizationId: fixtures.orgB.id,
    });
    expect(result).toBe(false);
  });

  it("8. Missing/mismatched entity — an Attachment whose entityId matches no Invoice at all — denied", async () => {
    const attachment = await createInvoiceAttachment(randomUUID(), fixtures.orgA.id);
    expect(await verifyPortalAttachmentAccess(attachment, identity())).toBe(false);
  });

  it("9. PROJECT and CLIENT attachment behavior is completely unaffected by the new INVOICE-only predicate", async () => {
    const clientAttachment = await prisma.attachment.findUniqueOrThrow({ where: { id: fixtures.attachment.id } });
    expect(await verifyPortalAttachmentAccess(clientAttachment, identity())).toBe(true);

    const projectAttachment = await prisma.attachment.create({
      data: {
        entityType: "PROJECT",
        entityId: fixtures.project.id,
        organizationId: fixtures.orgA.id,
        originalName: "finding-1-project.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storageBucket: "attachments",
        storagePath: `finding-1/project-${randomUUID()}.pdf`,
        uploadedById: fixtures.owner.id,
      },
    });
    attachmentIds.push(projectAttachment.id);
    expect(await verifyPortalAttachmentAccess(projectAttachment, identity())).toBe(true);
  });
});
