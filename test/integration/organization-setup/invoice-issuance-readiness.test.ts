import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getInvoiceIssuanceReadiness } from "@/lib/organization-setup/invoice-readiness";

/**
 * Advisory pre-issuance readiness signal (src/lib/organization-setup/
 * invoice-readiness.ts) — proves organization scoping, every readiness
 * combination, the exact approved two-boolean shape, and — using this
 * repo's own established MARKERS technique (see
 * test/integration/platform-admin/organization-detail-onboarding.test.ts)
 * — that no underlying company-profile/payment value ever reaches the
 * returned readiness object, even when real, marker-tagged rows exist.
 *
 * Every organization here is created directly (never the shared
 * seedTestData() fixture) so each readiness combination is fully
 * isolated. Deleting an Organization row cascades OrganizationProfile/
 * OrganizationPaymentDetails automatically (both onDelete: Cascade), so
 * no separate cleanup call is needed for either.
 */

const createdOrgIds: string[] = [];

async function createOrg(name: string): Promise<{ id: string }> {
  const org = await prisma.organization.create({ data: { name, slug: `readiness-test-${randomUUID()}` } });
  createdOrgIds.push(org.id);
  return org;
}

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
});

describe("getInvoiceIssuanceReadiness", () => {
  it("both false for a brand-new organization with no profile and no payment details", async () => {
    const org = await createOrg("Readiness Fresh Org");
    const readiness = await getInvoiceIssuanceReadiness(org.id);
    expect(readiness).toEqual({ companyProfileReady: false, paymentDetailsReady: false });
  });

  it("companyProfileReady true, paymentDetailsReady false — profile exists, no payment details", async () => {
    const org = await createOrg("Readiness Profile Only Org");
    await prisma.organizationProfile.create({
      data: { organizationId: org.id, legalName: "Profile Only LLC", country: "United States", currency: "USD", timezone: "America/New_York" },
    });

    const readiness = await getInvoiceIssuanceReadiness(org.id);
    expect(readiness).toEqual({ companyProfileReady: true, paymentDetailsReady: false });
  });

  it("companyProfileReady false, paymentDetailsReady true — payment details exist, no profile", async () => {
    const org = await createOrg("Readiness Payment Only Org");
    await prisma.organizationPaymentDetails.create({
      data: { organizationId: org.id, bankName: "Test Bank", accountHolder: "Test Holder", accountNumber: "TEST-ACCT-1", swiftBic: "TESTUS33" },
    });

    const readiness = await getInvoiceIssuanceReadiness(org.id);
    expect(readiness).toEqual({ companyProfileReady: false, paymentDetailsReady: true });
  });

  it("both true when both a profile and payment details exist", async () => {
    const org = await createOrg("Readiness Both Ready Org");
    await Promise.all([
      prisma.organizationProfile.create({
        data: { organizationId: org.id, legalName: "Both Ready LLC", country: "United States", currency: "USD", timezone: "America/New_York" },
      }),
      prisma.organizationPaymentDetails.create({
        data: { organizationId: org.id, bankName: "Test Bank", accountHolder: "Test Holder", accountNumber: "TEST-ACCT-2", swiftBic: "TESTUS33" },
      }),
    ]);

    const readiness = await getInvoiceIssuanceReadiness(org.id);
    expect(readiness).toEqual({ companyProfileReady: true, paymentDetailsReady: true });
  });

  it("exposes only the two approved boolean fields — no extra key of any kind", async () => {
    const org = await createOrg("Readiness Shape Org");
    const readiness = await getInvoiceIssuanceReadiness(org.id);
    expect(Object.keys(readiness).sort()).toEqual(["companyProfileReady", "paymentDetailsReady"]);
    expect(typeof readiness.companyProfileReady).toBe("boolean");
    expect(typeof readiness.paymentDetailsReady).toBe("boolean");
  });

  it("organization scoping: one organization's real data never affects a different organization's readiness", async () => {
    const configuredOrg = await createOrg("Readiness Scoping Configured Org");
    const freshOrg = await createOrg("Readiness Scoping Fresh Org");
    await Promise.all([
      prisma.organizationProfile.create({
        data: { organizationId: configuredOrg.id, legalName: "Scoping LLC", country: "United States", currency: "USD", timezone: "America/New_York" },
      }),
      prisma.organizationPaymentDetails.create({
        data: { organizationId: configuredOrg.id, bankName: "Test Bank", accountHolder: "Test Holder", accountNumber: "TEST-ACCT-3", swiftBic: "TESTUS33" },
      }),
    ]);

    const [configuredReadiness, freshReadiness] = await Promise.all([
      getInvoiceIssuanceReadiness(configuredOrg.id),
      getInvoiceIssuanceReadiness(freshOrg.id),
    ]);

    expect(configuredReadiness).toEqual({ companyProfileReady: true, paymentDetailsReady: true });
    expect(freshReadiness).toEqual({ companyProfileReady: false, paymentDetailsReady: false });
  });

  it("MARKERS: real sensitive profile/payment values never reach the returned readiness object, even though it correctly reports both ready", async () => {
    const org = await createOrg("Readiness Markers Org");
    const MARKERS = {
      legalName: "MARKER-LEGAL-NAME-must-never-leak",
      bankName: "MARKER-BANK-NAME-must-never-leak",
      accountHolder: "MARKER-ACCOUNT-HOLDER-must-never-leak",
      accountNumber: "MARKER-ACCOUNT-NUMBER-must-never-leak",
      swiftBic: "MARKERBIC",
      taxId: "MARKER-TAX-ID-must-never-leak",
      streetAddress: "MARKER-STREET-must-never-leak",
    };
    await Promise.all([
      prisma.organizationProfile.create({
        data: {
          organizationId: org.id,
          legalName: MARKERS.legalName,
          country: "United States",
          currency: "USD",
          timezone: "America/New_York",
          taxId: MARKERS.taxId,
          streetAddress: MARKERS.streetAddress,
        },
      }),
      prisma.organizationPaymentDetails.create({
        data: {
          organizationId: org.id,
          bankName: MARKERS.bankName,
          accountHolder: MARKERS.accountHolder,
          accountNumber: MARKERS.accountNumber,
          swiftBic: MARKERS.swiftBic,
          paymentInstructions: "MARKER-INSTRUCTIONS-must-never-leak",
        },
      }),
    ]);

    const readiness = await getInvoiceIssuanceReadiness(org.id);
    expect(readiness).toEqual({ companyProfileReady: true, paymentDetailsReady: true });

    const serialized = JSON.stringify(readiness);
    for (const marker of Object.values(MARKERS)) {
      expect(serialized).not.toContain(marker);
    }
    expect(serialized).not.toContain("MARKER-INSTRUCTIONS-must-never-leak");
    expect(serialized).not.toContain(org.id);
  });
});
