import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-contract proof that the invoice-issuance readiness notice can
 * never broaden Payment Details read access: getInvoiceIssuanceReadiness()
 * (src/lib/organization-setup/invoice-readiness.ts) performs no role
 * check of its own — the exact same "authorization happens at the call
 * site" contract getCompanyProfile()/getPaymentDetails() already
 * document — so the one real call site (EditInvoicePage) must be proven
 * to only ever invoke it once `canIssue` (the existing OWNER-only Issue
 * gate, canAccessPaymentDetails) is already true. A behavioral (DOM-
 * rendered) proof of "an ADMIN/MEMBER never sees this" also exists at the
 * E2E level (invoice-issuance-readiness.spec.ts); this file proves the
 * server-side data-fetch itself is gated, not merely the presentation.
 */

const pageSource = readFileSync("src/app/(dashboard)/invoices/[id]/edit/page.tsx", "utf-8");

describe("EditInvoicePage — invoice-issuance readiness fetch is OWNER-gated", () => {
  it("computes readiness only inside an `isDraft && canIssue` conditional expression", () => {
    expect(pageSource).toMatch(/const readiness = isDraft && canIssue \? await getInvoiceIssuanceReadiness\(organizationId\) : undefined;/);
  });

  it("canIssue is derived from the exact same canAccessPaymentDetails check Payment Details already use", () => {
    expect(pageSource).toMatch(/const canIssue = canAccessPaymentDetails\(membership\.role\);/);
  });

  it("getInvoiceIssuanceReadiness is only ever actually invoked (awaited) once in this file", () => {
    const occurrences = (pageSource.match(/await getInvoiceIssuanceReadiness\(/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

/** Strips /** *\/ JSDoc blocks only — same bounded technique check-platform-admin-security.mjs's own stripBlockComments() uses — so this file's own explanatory doc comments (which legitimately name every excluded field in prose) can never trip a check meant for real executable code. */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*\*[\s\S]*?\*\//g, "");
}

describe("getInvoiceIssuanceReadiness — narrow select, no sensitive field ever read", () => {
  const librarySource = readFileSync("src/lib/organization-setup/invoice-readiness.ts", "utf-8");
  const code = stripBlockComments(librarySource);

  it("selects only `id` from OrganizationProfile and OrganizationPaymentDetails — never a business/bank field", () => {
    expect(code).toMatch(/prisma\.organizationProfile\.findUnique\(\{ where: \{ organizationId \}, select: \{ id: true \} \}\)/);
    expect(code).toMatch(/prisma\.organizationPaymentDetails\.findUnique\(\{ where: \{ organizationId \}, select: \{ id: true \} \}\)/);
  });

  it("never references any sensitive OrganizationProfile/OrganizationPaymentDetails field name outside of its own doc comments", () => {
    const forbidden = [
      "legalName",
      "taxId",
      "supportEmail",
      "phone",
      "website",
      "brandColor",
      "streetAddress",
      "bankName",
      "accountHolder",
      "accountNumber",
      "swiftBic",
      "paymentInstructions",
    ];
    for (const field of forbidden) {
      expect(code).not.toContain(field);
    }
  });
});
