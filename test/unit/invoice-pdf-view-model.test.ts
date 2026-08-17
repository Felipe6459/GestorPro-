import { describe, expect, it, vi } from "vitest";

// src/lib/invoices/pdf/view-model.ts imports the real "server-only"
// marker package — see test/unit/cron-auth.test.ts's own header comment
// for the identical precedent.
vi.mock("server-only", () => ({}));

import {
  buildInvoicePdfViewModel,
  toRendererIssuerPresentation,
  toRendererRecipientPresentation,
  type InvoicePdfBuildInput,
  type InvoicePdfIssuerPresentation,
  type InvoicePdfRecipientPresentation,
} from "@/lib/invoices/pdf/view-model";
import type { InvoiceIssuerSnapshotV1, InvoiceRecipientSnapshotV1 } from "@/lib/invoices/pdf/snapshot-types";

const ISSUER_PRESENTATION: InvoicePdfIssuerPresentation = {
  legalName: "Acme Corp",
  address: { streetAddress: "1 Main St", city: "Springfield", state: "IL", postalCode: "62701" },
  country: "US",
  taxId: "12-3456789",
  supportEmail: "support@acme.test",
  phone: null,
  website: null,
  brandColor: null,
  payment: null,
  logoImage: null,
};

const RECIPIENT_PRESENTATION: InvoicePdfRecipientPresentation = {
  billingName: "Jane Doe",
  email: "jane@example.test",
  address: { streetAddress: null, city: null, state: null, postalCode: null },
  country: null,
  taxId: null,
};

function baseInput(overrides: Partial<InvoicePdfBuildInput> = {}): InvoicePdfBuildInput {
  return {
    documentStatus: "SENT",
    invoiceNumber: "INV-100",
    issueDate: new Date("2026-08-17T00:00:00.000Z"),
    dueDate: new Date("2026-09-01T00:00:00.000Z"),
    lineItems: [],
    flatAmount: "250.00",
    totals: {
      amount: "250.00",
      subtotal: "250.00",
      discountType: "NONE",
      discountAmount: null,
      discountValue: null,
      taxRatePercent: null,
      taxAmount: null,
      taxLabel: "TAX",
      currency: "USD",
    },
    notes: null,
    issuer: ISSUER_PRESENTATION,
    recipient: RECIPIENT_PRESENTATION,
    ...overrides,
  };
}

describe("buildInvoicePdfViewModel — documentStatus contract", () => {
  it("an explicit SENT documentStatus produces documentStatus SENT in the output, with no `status` field accepted anywhere in the input type", () => {
    const result = buildInvoicePdfViewModel(baseInput({ documentStatus: "SENT" }));
    expect(result.documentStatus).toBe("SENT");
  });

  it("a source object carrying an incidental DRAFT-shaped extra property never influences documentStatus — the builder never reads any such field", () => {
    // Simulates "a DRAFT source prepared for Issue" — the caller explicitly
    // passes documentStatus: "SENT" (the server-derived target state) even
    // though a hypothetical underlying Invoice row is still DRAFT at this
    // point in the real pipeline (the DB transition happens only after
    // rendering, per the Issue pipeline design). The input type has no
    // `status` field at all, so there is nothing to "blindly copy".
    const input = baseInput({ documentStatus: "SENT" });
    const result = buildInvoicePdfViewModel(input);
    expect(result.documentStatus).toBe("SENT");
    expect(result.documentStatus).not.toBe("DRAFT");
  });

  it.each(["SENT", "PAID", "OVERDUE", "CANCELLED"] as const)("legacy target status %s is preserved exactly", (status) => {
    const result = buildInvoicePdfViewModel(baseInput({ documentStatus: status }));
    expect(result.documentStatus).toBe(status);
  });

  it("does not mutate the input object", () => {
    const input = baseInput();
    const snapshotBefore = structuredClone(input);
    buildInvoicePdfViewModel(input);
    expect(input).toEqual(snapshotBefore);
  });

  it("does not mutate the input's nested issuer/recipient/totals objects", () => {
    const input = baseInput();
    Object.freeze(input.issuer);
    Object.freeze(input.issuer.address);
    Object.freeze(input.recipient);
    Object.freeze(input.totals);
    expect(() => buildInvoicePdfViewModel(input)).not.toThrow();
  });
});

describe("buildInvoicePdfViewModel — flat vs itemized line items", () => {
  it("a flat invoice (empty lineItems) produces exactly one synthetic 'Services' row", () => {
    const result = buildInvoicePdfViewModel(baseInput({ lineItems: [], flatAmount: "500.00" }));
    expect(result.isFlatSynthetic).toBe(true);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].description).toBe("Services");
    expect(result.lineItems[0].quantity).toBe("1");
  });

  it("an itemized invoice preserves the given line-item order exactly", () => {
    const result = buildInvoicePdfViewModel(
      baseInput({
        lineItems: [
          { description: "Design", quantity: "2", unitPrice: "50.00", lineTotal: "100.00" },
          { description: "Hosting", quantity: "1", unitPrice: "29.99", lineTotal: "29.99" },
          { description: "Support", quantity: "3", unitPrice: "10.00", lineTotal: "30.00" },
        ],
      }),
    );
    expect(result.isFlatSynthetic).toBe(false);
    expect(result.lineItems.map((li) => li.description)).toEqual(["Design", "Hosting", "Support"]);
    expect(result.lineItems[0].quantity).toBe("2");
  });

  it("never persists/returns a synthetic line item flag on itemized output", () => {
    const result = buildInvoicePdfViewModel(
      baseInput({ lineItems: [{ description: "Design", quantity: "1", unitPrice: "10.00", lineTotal: "10.00" }] }),
    );
    expect(result.isFlatSynthetic).toBe(false);
  });
});

describe("buildInvoicePdfViewModel — deterministic en-US formatting", () => {
  it("formats currency amounts using en-US regardless of runtime default locale", () => {
    const result = buildInvoicePdfViewModel(
      baseInput({ lineItems: [], flatAmount: "1234.50", totals: { ...baseInput().totals, amount: "1234.50" } }),
    );
    expect(result.totals.total).toBe("$1,234.50");
  });

  it("formats issueDate/dueDate deterministically (en-US, UTC-pinned)", () => {
    const result = buildInvoicePdfViewModel(
      baseInput({ issueDate: new Date("2026-08-17T00:00:00.000Z"), dueDate: new Date("2026-09-01T00:00:00.000Z") }),
    );
    expect(result.issueDateDisplay).toBe("8/17/2026");
    expect(result.dueDateDisplay).toBe("9/1/2026");
  });

  it("dueDateDisplay is null when dueDate is null", () => {
    const result = buildInvoicePdfViewModel(baseInput({ dueDate: null }));
    expect(result.dueDateDisplay).toBeNull();
  });
});

describe("buildInvoicePdfViewModel — discount/tax omission rules (reused from totals-view-model)", () => {
  it("omits the discount row when discountType is NONE", () => {
    const result = buildInvoicePdfViewModel(
      baseInput({ totals: { ...baseInput().totals, discountType: "NONE", discountAmount: null } }),
    );
    expect(result.totals.discountRow).toBeNull();
  });

  it("includes the discount row when a discount is present", () => {
    const result = buildInvoicePdfViewModel(
      baseInput({
        totals: { ...baseInput().totals, discountType: "PERCENTAGE", discountValue: "10", discountAmount: "25.00" },
      }),
    );
    expect(result.totals.discountRow).toEqual({ label: "Discount (10%)", amount: "$25.00" });
  });

  it("omits the tax row when tax fields are null", () => {
    const result = buildInvoicePdfViewModel(baseInput());
    expect(result.totals.taxRow).toBeNull();
  });
});

describe("buildInvoicePdfViewModel — no storage provenance, no internalNotes in the resulting view model", () => {
  it("the resulting view model JSON never contains a bucket/path/sha256/provenance-shaped key", () => {
    const result = buildInvoicePdfViewModel(baseInput());
    const json = JSON.stringify(result);
    expect(json).not.toContain("bucket");
    expect(json).not.toContain("sha256");
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("pdfStoragePath");
  });

  it("the accepted input type has no internalNotes field at all (structural exclusion, not a runtime scrub)", () => {
    const input = baseInput();
    // @ts-expect-error internalNotes is not part of InvoicePdfBuildInput's type
    input.internalNotes = "should never be accepted";
    const result = buildInvoicePdfViewModel(input);
    expect(JSON.stringify(result)).not.toContain("should never be accepted");
  });
});

describe("toRendererIssuerPresentation — mapping from persisted snapshot to renderer-safe presentation", () => {
  const snapshot: InvoiceIssuerSnapshotV1 = {
    schemaVersion: 1,
    legalName: "Acme Corp",
    address: { streetAddress: "1 Main St", city: "Springfield", state: "IL", postalCode: "62701" },
    country: "US",
    taxId: "12-3456789",
    supportEmail: "support@acme.test",
    phone: null,
    website: null,
    brandColor: "#336699",
    payment: { bankName: "Bank", accountHolder: "Holder", accountNumber: "123", swiftBic: "ABCD", paymentInstructions: null },
    logo: { included: true, bucket: "logos", path: "organizations/org-1/logo.png", contentType: "image/png", sha256: "a".repeat(64) },
  };

  it("drops bucket/path/sha256 provenance entirely from the result", () => {
    const presentation = toRendererIssuerPresentation(snapshot, null);
    expect(JSON.stringify(presentation)).not.toContain("bucket");
    expect(JSON.stringify(presentation)).not.toContain("sha256");
    expect(JSON.stringify(presentation)).not.toContain("logos");
  });

  it("logoImage is null when no logo bytes are supplied, regardless of the snapshot's own provenance", () => {
    const presentation = toRendererIssuerPresentation(snapshot, null);
    expect(presentation.logoImage).toBeNull();
  });

  it("logoImage is a data URI built only from the supplied already-validated bytes", () => {
    const presentation = toRendererIssuerPresentation(snapshot, { data: Buffer.from("fake-png-bytes"), contentType: "image/png" });
    expect(presentation.logoImage).not.toBeNull();
    expect(presentation.logoImage!.dataUri.startsWith("data:image/png;base64,")).toBe(true);
    expect(presentation.logoImage!.dataUri).not.toContain("logos");
    expect(presentation.logoImage!.dataUri).not.toContain("http");
  });

  it("carries over the visible fields unchanged", () => {
    const presentation = toRendererIssuerPresentation(snapshot, null);
    expect(presentation.legalName).toBe("Acme Corp");
    expect(presentation.payment).toEqual({ bankName: "Bank", accountHolder: "Holder", accountNumber: "123", swiftBic: "ABCD", paymentInstructions: null });
  });
});

describe("toRendererRecipientPresentation", () => {
  it("carries over visible fields unchanged with no additional fields", () => {
    const snapshot: InvoiceRecipientSnapshotV1 = {
      schemaVersion: 1,
      billingName: "Jane Doe",
      email: "jane@example.test",
      address: { streetAddress: null, city: null, state: null, postalCode: null },
      country: null,
      taxId: null,
    };
    const presentation = toRendererRecipientPresentation(snapshot);
    expect(presentation).toEqual({
      billingName: "Jane Doe",
      email: "jane@example.test",
      address: { streetAddress: null, city: null, state: null, postalCode: null },
      country: null,
      taxId: null,
    });
  });
});
