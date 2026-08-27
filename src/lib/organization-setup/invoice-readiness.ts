import { prisma } from "@/lib/prisma";

export type InvoiceIssuanceReadiness = {
  companyProfileReady: boolean;
  paymentDetailsReady: boolean;
};

/**
 * Read-only, boolean-only readiness signal for the DRAFT invoice Issue
 * control (advisory pre-issuance notice — see InvoiceIssuanceReadinessNotice,
 * src/components/invoices/invoice-issuance-readiness-notice.tsx). This is
 * never consulted by issueInvoice() itself and never blocks Issue; it only
 * powers a warning shown before the OWNER clicks it.
 *
 * The two booleans reuse the exact same authoritative "is there anything to
 * embed" rules issueInvoice()'s own buildIssuerSnapshot() input already
 * relies on (src/lib/invoices/pdf/issue-invoice.ts): a profile is only ever
 * passed to buildIssuerSnapshotV1() when `profile.legalName` is truthy, and
 * payment is only ever non-null when an OrganizationPaymentDetails row
 * exists at all. Since OrganizationProfile.legalName is a required,
 * non-nullable column that can only ever be set via one full, validated
 * upsertCompanyProfile() submission (see that module's own doc comment),
 * "a profile row exists" and "profile.legalName is truthy" are the same
 * fact — so `companyProfileReady` is computed as row-existence, never a
 * second, independently-invented completeness rule.
 *
 * Selects only `id` from each table — this call site never reads
 * legalName, address, tax id, support email, phone, website, brand color,
 * bank name, account holder, account number, SWIFT/BIC, or payment
 * instructions merely to answer "is this configured yet?". Callers MUST
 * have already independently verified OWNER access
 * (canAccessPaymentDetails/assertCanAccessPaymentDetails) before calling
 * this — this function performs no role check of its own, the same
 * "authorization happens at the call site" contract getCompanyProfile()/
 * getPaymentDetails() already document.
 */
export async function getInvoiceIssuanceReadiness(organizationId: string): Promise<InvoiceIssuanceReadiness> {
  const [profile, paymentDetails] = await Promise.all([
    prisma.organizationProfile.findUnique({ where: { organizationId }, select: { id: true } }),
    prisma.organizationPaymentDetails.findUnique({ where: { organizationId }, select: { id: true } }),
  ]);

  return {
    companyProfileReady: profile !== null,
    paymentDetailsReady: paymentDetails !== null,
  };
}
