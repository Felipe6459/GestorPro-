import Link from "next/link";
import type { InvoiceIssuanceReadiness } from "@/lib/organization-setup/invoice-readiness";

/**
 * Advisory-only pre-issuance notice, rendered adjacent to
 * InvoiceIssueControls (InvoiceDraftPanel) — never a mutation control,
 * never something that disables or blocks Issue. Renders nothing when
 * both are ready. `readiness` carries only two booleans
 * (getInvoiceIssuanceReadiness, src/lib/organization-setup/invoice-
 * readiness.ts) — no legal name, address, tax id, bank name, account
 * number, SWIFT/BIC, or payment instructions ever reaches this component,
 * so there is nothing sensitive here to protect with its own
 * authorization check; the caller (InvoiceDraftPanel, gated on the exact
 * same `canIssue` OWNER check the Issue control itself uses) is
 * responsible for only ever rendering this alongside Issue, never for a
 * non-OWNER.
 *
 * The two messages are independent and additive — an OWNER missing both
 * sees both lines, never a single vague combined sentence and never two
 * separate alert boxes. Never calls this "launch readiness" and never
 * mentions branding/domain — this is scoped strictly to what an issued
 * PDF will and won't contain.
 */
export function InvoiceIssuanceReadinessNotice({ readiness }: { readiness: InvoiceIssuanceReadiness }) {
  const { companyProfileReady, paymentDetailsReady } = readiness;
  if (companyProfileReady && paymentDetailsReady) {
    return null;
  }

  return (
    <div role="status" className="mb-4 flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      {!companyProfileReady && (
        <p>
          Company profile isn&apos;t set up yet — seller details in the issued PDF may be incomplete.{" "}
          <Link href="/settings/company" className="underline underline-offset-2 hover:no-underline">
            Set up company profile
          </Link>
        </p>
      )}
      {!paymentDetailsReady && (
        <p>
          Payment receiving details aren&apos;t set up yet — the issued invoice won&apos;t include payment instructions.{" "}
          <Link href="/settings/payment" className="underline underline-offset-2 hover:no-underline">
            Set up payment details
          </Link>
        </p>
      )}
    </div>
  );
}
