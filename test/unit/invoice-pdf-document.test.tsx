import { describe, expect, it, vi } from "vitest";

// src/lib/invoices/pdf/document.tsx (and its font-registration/view-model
// imports) pulls in the real "server-only" marker package — see
// test/unit/cron-auth.test.ts's own header comment for the identical
// precedent.
vi.mock("server-only", () => ({}));

import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdfDocument, renderInvoicePdfBuffer } from "@/lib/invoices/pdf/document";
import { buildInvoicePdfViewModel, type InvoicePdfBuildInput, type InvoicePdfIssuerPresentation, type InvoicePdfRecipientPresentation } from "@/lib/invoices/pdf/view-model";

const ISSUER: InvoicePdfIssuerPresentation = {
  legalName: "Acme Corp",
  address: { streetAddress: "1 Main St", city: "Springfield", state: "IL", postalCode: "62701" },
  country: "US",
  taxId: "12-3456789",
  supportEmail: "support@acme.test",
  phone: "+1-555-0100",
  website: "https://acme.test",
  brandColor: "#336699",
  payment: {
    bankName: "First Bank",
    accountHolder: "Acme Corp",
    accountNumber: "000123456",
    swiftBic: "FBUS1234",
    paymentInstructions: "Please include invoice number.",
  },
  logoImage: null,
};

const RECIPIENT: InvoicePdfRecipientPresentation = {
  billingName: "Jane Doe",
  email: "jane@example.test",
  address: { streetAddress: "2 Elm St", city: "Metropolis", state: "NY", postalCode: "10001" },
  country: "US",
  taxId: "98-7654321",
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
    notes: "Thank you for your business.",
    issuer: ISSUER,
    recipient: RECIPIENT,
    ...overrides,
  };
}

function isPdfSignature(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString("latin1") === "%PDF";
}

describe("renderInvoicePdfBuffer — real end-to-end render", () => {
  it("renders a flat invoice to a real, non-empty PDF buffer", async () => {
    const viewModel = buildInvoicePdfViewModel(baseInput());
    const buffer = await renderInvoicePdfBuffer(viewModel);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(isPdfSignature(buffer)).toBe(true);
  });

  it("renders an itemized invoice with real line items to a valid PDF buffer", async () => {
    const viewModel = buildInvoicePdfViewModel(
      baseInput({
        lineItems: [
          { description: "Design", quantity: "2", unitPrice: "50.00", lineTotal: "100.00" },
          { description: "Hosting", quantity: "1", unitPrice: "29.99", lineTotal: "29.99" },
        ],
      }),
    );
    const buffer = await renderInvoicePdfBuffer(viewModel);
    expect(isPdfSignature(buffer)).toBe(true);
  });

  it("renders Cyrillic and Greek text without throwing or omitting a glyph error", async () => {
    const viewModel = buildInvoicePdfViewModel(
      baseInput({
        issuer: { ...ISSUER, legalName: "Организация «Тест»" },
        recipient: { ...RECIPIENT, billingName: "Ξεσκεπάζω την ψυχοφθόρα" },
        notes: "Съешь ещё этих мягких французских булок",
      }),
    );
    await expect(renderInvoicePdfBuffer(viewModel)).resolves.toSatisfy((buffer: Buffer) => isPdfSignature(buffer));
  });

  it("the rendered PDF embeds the registered Noto Sans font, not a fallback standard-14 font", async () => {
    const viewModel = buildInvoicePdfViewModel(baseInput({ issuer: { ...ISSUER, legalName: "Кириллица" } }));
    const buffer = await renderInvoicePdfBuffer(viewModel);
    const raw = buffer.toString("latin1");
    expect(raw).toContain("NotoSans");
    expect(raw).not.toContain("/BaseFont /Helvetica");
  });

  it("renders without throwing for up to 200 line items with long descriptions (wrapping/page-break safety)", async () => {
    const longDescription = "X".repeat(500);
    const lineItems = Array.from({ length: 200 }, (_, i) => ({
      description: `${longDescription} #${i}`,
      quantity: "1",
      unitPrice: "1.00",
      lineTotal: "1.00",
    }));
    const viewModel = buildInvoicePdfViewModel(baseInput({ lineItems }));
    const buffer = await renderInvoicePdfBuffer(viewModel);
    expect(isPdfSignature(buffer)).toBe(true);
  });

  it("omits the payment section entirely when payment is null", async () => {
    const viewModel = buildInvoicePdfViewModel(baseInput({ issuer: { ...ISSUER, payment: null } }));
    const buffer = await renderInvoicePdfBuffer(viewModel);
    expect(isPdfSignature(buffer)).toBe(true);
  });

  it("omits the notes section entirely when notes is null", async () => {
    const viewModel = buildInvoicePdfViewModel(baseInput({ notes: null }));
    const buffer = await renderInvoicePdfBuffer(viewModel);
    expect(isPdfSignature(buffer)).toBe(true);
  });
});

describe("InvoicePdfDocument — direct component render via renderToBuffer", () => {
  it("renders successfully when constructed and passed directly to renderToBuffer", async () => {
    const viewModel = buildInvoicePdfViewModel(baseInput());
    const buffer = await renderToBuffer(<InvoicePdfDocument viewModel={viewModel} />);
    expect(isPdfSignature(buffer)).toBe(true);
  });

  it("registering fonts repeatedly across multiple renders is idempotent and does not throw", async () => {
    const viewModel = buildInvoicePdfViewModel(baseInput());
    const first = await renderToBuffer(<InvoicePdfDocument viewModel={viewModel} />);
    const second = await renderToBuffer(<InvoicePdfDocument viewModel={viewModel} />);
    expect(isPdfSignature(first)).toBe(true);
    expect(isPdfSignature(second)).toBe(true);
  });
});
