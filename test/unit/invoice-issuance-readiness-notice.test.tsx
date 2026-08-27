import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceIssuanceReadinessNotice } from "@/components/invoices/invoice-issuance-readiness-notice";
import type { InvoiceIssuanceReadiness } from "@/lib/organization-setup/invoice-readiness";

/**
 * Advisory pre-issuance readiness notice — genuine behavior-level render
 * coverage, same `renderToStaticMarkup` technique as segment-error-
 * state.test.tsx (this repo has no `@testing-library/react`/jsdom). This
 * component takes only two booleans, so there is no sensitive value it
 * could ever be handed to leak — the "no sensitive values leak" tests
 * below prove that even a real bank name/legal name/tax id string never
 * reaches this file, by construction of `InvoiceIssuanceReadiness` itself
 * (it has no field capable of holding one), not merely by omission.
 */

function html(readiness: InvoiceIssuanceReadiness): string {
  return renderToStaticMarkup(<InvoiceIssuanceReadinessNotice readiness={readiness} />);
}

describe("InvoiceIssuanceReadinessNotice", () => {
  it("renders nothing when both Company Profile and Payment Details are ready", () => {
    expect(html({ companyProfileReady: true, paymentDetailsReady: true })).toBe("");
  });

  it("shows only the company-profile message when only Company Profile is incomplete", () => {
    const markup = html({ companyProfileReady: false, paymentDetailsReady: true });
    expect(markup).toContain("Company profile isn");
    expect(markup).toContain("seller details in the issued PDF may be incomplete");
    expect(markup).not.toContain("Payment receiving details");
  });

  it("shows only the payment-details message when only Payment Details are missing", () => {
    const markup = html({ companyProfileReady: true, paymentDetailsReady: false });
    expect(markup).toContain("Payment receiving details aren");
    expect(markup).toContain("won&#x27;t include payment instructions");
    expect(markup).not.toContain("Company profile");
  });

  it("shows both messages, distinctly, when both are incomplete — never one merged vague sentence", () => {
    const markup = html({ companyProfileReady: false, paymentDetailsReady: false });
    expect(markup).toContain("Company profile isn");
    expect(markup).toContain("Payment receiving details aren");
    // Two independent <p> lines, not a single collapsed paragraph.
    expect(markup.match(/<p>/g)?.length).toBe(2);
  });

  it("renders exactly one advisory status region, never role=\"alert\" (this is advisory, not an error)", () => {
    const markup = html({ companyProfileReady: false, paymentDetailsReady: false });
    expect(markup.match(/role="status"/g)?.length).toBe(1);
    expect(markup).not.toContain('role="alert"');
  });

  it("links to the existing, ID-free Settings routes only — never a mutation control", () => {
    const markup = html({ companyProfileReady: false, paymentDetailsReady: false });
    expect(markup).toContain('href="/settings/company"');
    expect(markup).toContain('href="/settings/payment"');
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<form");
  });

  it("never says \"launch ready\" or mentions branding/domain", () => {
    for (const readiness of [
      { companyProfileReady: false, paymentDetailsReady: true },
      { companyProfileReady: true, paymentDetailsReady: false },
      { companyProfileReady: false, paymentDetailsReady: false },
    ] satisfies InvoiceIssuanceReadiness[]) {
      const markup = html(readiness);
      expect(markup.toLowerCase()).not.toContain("launch ready");
      expect(markup.toLowerCase()).not.toContain("brand");
      expect(markup.toLowerCase()).not.toContain("domain");
    }
  });

  it("introduces no new dependency and reads no sensitive-data module — imports only react/next/its own readiness type", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/invoices/invoice-issuance-readiness-notice.tsx", "utf-8");
    const importLines = source.match(/^import .+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).toMatch(/from "(next\/link|@\/lib\/organization-setup\/invoice-readiness)"/);
    }
    expect(source).not.toMatch(/@\/lib\/organization-setup\/(company-profile|payment-details)/);
  });
});
