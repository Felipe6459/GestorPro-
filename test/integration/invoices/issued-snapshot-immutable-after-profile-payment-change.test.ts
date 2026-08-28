import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCompanyProfile } from "@/lib/organization-setup/company-profile";
import { getPaymentDetails } from "@/lib/organization-setup/payment-details";

/**
 * Invoice/PDF readiness research follow-up — one small, narrowly-scoped
 * regression proving the historical-immutability guarantee the earlier
 * research described but never captured as its own test: once an invoice
 * is issued, later edits to Company Profile / Payment Receiving Details
 * must never alter that invoice's already-persisted issuer snapshot.
 *
 * This does not modify or reinterpret the existing snapshot/archive
 * implementation in any way — it only proves, end to end against the
 * real database, a guarantee that already follows structurally from
 * issueInvoice() persisting a snapshot once at Issue time and no download/
 * view path ever re-reading OrganizationProfile/OrganizationPaymentDetails
 * for an already-issued invoice (see src/lib/invoices/pdf/issue-invoice.ts
 * and src/app/api/invoices/[id]/pdf/route.ts).
 *
 * TEST_MODE=1 (top-level, this file only) so issueInvoice()'s render/
 * upload/logo steps use their existing safe TEST_MODE branches instead of
 * touching real Supabase Storage — same established technique as
 * test/integration/invoices/issue.test.ts and
 * issuance-readiness-does-not-block-issue.test.ts. Every organization
 * here is created directly (never the shared seedTestData() fixture) so
 * its Company Profile / Payment Details are fully under this file's own
 * control.
 *
 * Cleanup order: InvoicePdfArchiveObject/Invoice before Project/Client
 * (both Restrict-referenced by Invoice), Project/Client before their
 * owning User (Restrict), Organization last of all — deleting it cascades
 * Membership/OrganizationProfile/OrganizationPaymentDetails automatically
 * (all onDelete: Cascade).
 */

const ORIGINAL_TEST_MODE = process.env.TEST_MODE;
process.env.TEST_MODE = "1";

const { issueInvoice } = await import("@/lib/invoices/pdf/issue-invoice");
const { parseIssuerSnapshot } = await import("@/lib/invoices/pdf/snapshot-types");

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  if (ORIGINAL_TEST_MODE === undefined) delete process.env.TEST_MODE;
  else process.env.TEST_MODE = ORIGINAL_TEST_MODE;

  await prisma.invoicePdfArchiveObject.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
  await prisma.invoice.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
  await prisma.project.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
  await prisma.client.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("an issued invoice's persisted issuer snapshot is immutable to later Company Profile / Payment Details edits", () => {
  it("changing Company Profile and Payment Details after Issue does not alter the already-issued invoice's snapshot", async () => {
    const org = await prisma.organization.create({ data: { name: "Immutability Regression Org", slug: `immutability-regression-${randomUUID()}` } });
    createdOrgIds.push(org.id);
    const owner = await prisma.user.create({ data: { id: randomUUID(), name: "Immutability Regression Owner", email: `${randomUUID()}@example.com` } });
    createdUserIds.push(owner.id);
    const client = await prisma.client.create({ data: { name: "Immutability Regression Client", organizationId: org.id, userId: owner.id } });
    const project = await prisma.project.create({ data: { name: "Immutability Regression Project", organizationId: org.id, clientId: client.id, ownerId: owner.id } });

    await prisma.organizationProfile.create({
      data: { organizationId: org.id, legalName: "MARKER-ORIGINAL-LEGALNAME", country: "United States", currency: "USD", timezone: "America/New_York" },
    });
    await prisma.organizationPaymentDetails.create({
      data: { organizationId: org.id, bankName: "MARKER-ORIGINAL-BANK", accountHolder: "MARKER-ORIGINAL-HOLDER", accountNumber: "MARKER-ORIGINAL-ACCT", swiftBic: "ORIGB1C1" },
    });

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `IMMUT-${randomUUID()}`,
        status: "DRAFT",
        amount: "100.00",
        subtotal: "100.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        discountType: "NONE",
        taxLabel: "TAX",
        currency: "USD",
        issueDate: new Date("2026-01-01T00:00:00.000Z"),
        projectId: project.id,
        clientId: client.id,
        organizationId: org.id,
      },
    });

    const issueResult = await issueInvoice({
      actor: { organizationId: org.id, userId: owner.id, userName: owner.name, role: "OWNER" },
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });
    expect(issueResult.ok).toBe(true);

    const afterIssue = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(afterIssue.status).toBe("SENT");
    const originalParsed = parseIssuerSnapshot(afterIssue.issuerSnapshot);
    expect(originalParsed.ok).toBe(true);
    if (!originalParsed.ok) throw new Error("unreachable");
    expect(originalParsed.snapshot.legalName).toBe("MARKER-ORIGINAL-LEGALNAME");
    expect(originalParsed.snapshot.payment?.bankName).toBe("MARKER-ORIGINAL-BANK");
    expect(originalParsed.snapshot.payment?.accountHolder).toBe("MARKER-ORIGINAL-HOLDER");

    // The owner later edits Company Profile and Payment Details — a real
    // write to the same two tables issueInvoice() itself reads, via the
    // real Prisma models the settings actions themselves update.
    await prisma.organizationProfile.update({ where: { organizationId: org.id }, data: { legalName: "MARKER-CHANGED-LEGALNAME" } });
    await prisma.organizationPaymentDetails.update({ where: { organizationId: org.id }, data: { bankName: "MARKER-CHANGED-BANK", accountHolder: "MARKER-CHANGED-HOLDER" } });

    // Sanity check that the change actually took effect (a vacuous
    // "nothing changed" scenario would make the assertions below
    // meaningless) — reuses the real, existing read services, never a
    // hand-rolled query.
    const liveProfile = await getCompanyProfile(org.id);
    const livePayment = await getPaymentDetails(org.id);
    expect(liveProfile.legalName).toBe("MARKER-CHANGED-LEGALNAME");
    expect(livePayment?.bankName).toBe("MARKER-CHANGED-BANK");

    // The already-issued invoice's own persisted snapshot must be
    // completely unaffected by that later change.
    const afterProfileChange = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    const reparsed = parseIssuerSnapshot(afterProfileChange.issuerSnapshot);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) throw new Error("unreachable");
    expect(reparsed.snapshot.legalName).toBe("MARKER-ORIGINAL-LEGALNAME");
    expect(reparsed.snapshot.payment?.bankName).toBe("MARKER-ORIGINAL-BANK");
    expect(reparsed.snapshot.payment?.accountHolder).toBe("MARKER-ORIGINAL-HOLDER");
    expect(reparsed.snapshot.legalName).not.toBe("MARKER-CHANGED-LEGALNAME");
    expect(reparsed.snapshot.payment?.bankName).not.toBe("MARKER-CHANGED-BANK");

    // The persisted snapshot JSON itself never changed at all, byte for
    // byte, across the profile/payment edit.
    expect(JSON.stringify(afterProfileChange.issuerSnapshot)).toBe(JSON.stringify(afterIssue.issuerSnapshot));
  });
});
