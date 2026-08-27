import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { getInvoiceIssuanceReadiness } from "@/lib/organization-setup/invoice-readiness";

/**
 * The advisory pre-issuance readiness notice never changes issueInvoice()'s
 * own semantics — this file proves that explicitly, tying
 * getInvoiceIssuanceReadiness()'s result directly to a real issueInvoice()
 * call on the same organization/invoice, rather than leaving the
 * connection implicit. issueInvoice() itself is completely untouched by
 * this feature (see test/integration/invoices/issue.test.ts's own full,
 * unmodified suite — including its pre-existing "no configured logo (the
 * default fixture organization has no profile) falls back without
 * blocking Issue" case, which already exercises this same fixture
 * organization's own profile-free state) — this is additional, narrowly
 * scoped confirmation, not a replacement for that suite.
 *
 * TEST_MODE=1 is set here (top-level, this file only — see issue.test.ts's
 * own doc comment for why it's never set in the shared setup-env.ts)
 * purely so issueInvoice()'s render/upload/logo steps use their existing
 * safe TEST_MODE branches instead of touching real Supabase Storage; every
 * PDF-module import happens as a dynamic import performed AFTER that
 * assignment, matching the same established technique.
 */

const ORIGINAL_TEST_MODE = process.env.TEST_MODE;
process.env.TEST_MODE = "1";

const { issueInvoice } = await import("@/lib/invoices/pdf/issue-invoice");

afterAll(() => {
  if (ORIGINAL_TEST_MODE === undefined) delete process.env.TEST_MODE;
  else process.env.TEST_MODE = ORIGINAL_TEST_MODE;
});

describe("issueInvoice() remains fully allowed regardless of the advisory readiness result", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterAll(async () => {
    await prisma.invoicePdfArchiveObject.deleteMany({ where: { organizationId: fixtures.orgA.id } });
    await prisma.invoice.deleteMany({ where: { organizationId: fixtures.orgA.id, invoiceNumber: { startsWith: "INV-READINESS-NOBLOCK" } } });
    await cleanupTestData(fixtures);
  });

  it("readiness reports both incomplete for the fresh fixture organization, yet Issue still succeeds unmodified", async () => {
    const readinessBefore = await getInvoiceIssuanceReadiness(fixtures.orgA.id);
    expect(readinessBefore).toEqual({ companyProfileReady: false, paymentDetailsReady: false });

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-READINESS-NOBLOCK-${fixtures.runId}-${randomUUID().slice(0, 8)}`,
        status: "DRAFT",
        amount: "250.00",
        subtotal: "250.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        discountType: "NONE",
        taxLabel: "TAX",
        currency: "USD",
        issueDate: new Date("2026-01-01T00:00:00.000Z"),
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });

    const result = await issueInvoice({
      actor: { organizationId: fixtures.orgA.id, userId: fixtures.owner.id, userName: fixtures.owner.name, role: "OWNER" },
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });

    expect(result.ok).toBe(true);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("SENT");

    // The advisory signal is unaffected by, and has no effect on, Issue —
    // still both-incomplete after a successful Issue on this same org.
    const readinessAfter = await getInvoiceIssuanceReadiness(fixtures.orgA.id);
    expect(readinessAfter).toEqual({ companyProfileReady: false, paymentDetailsReady: false });
  });
});
