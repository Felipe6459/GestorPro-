import { describe, expect, it } from "vitest";

// src/lib/invoices/pdf/document.tsx (and its font-registration/view-model
// imports) pulls in the real "server-only" marker package — same
// established precedent as invoice-pdf-document.test.tsx.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { renderInvoicePdfBuffer } from "@/lib/invoices/pdf/document";
import {
  buildInvoicePdfViewModel,
  type InvoicePdfBuildInput,
  type InvoicePdfIssuerPresentation,
  type InvoicePdfRecipientPresentation,
} from "@/lib/invoices/pdf/view-model";
import { calculateInvoiceTotals, type InvoiceCalculationInput } from "@/lib/invoices/calculations";
import { validatePdfBuffer, MAX_PDF_BYTES } from "@/lib/invoices/pdf/buffer-validation";
import { INVOICE_NOTES_MAX_LENGTH } from "@/lib/validation/invoice";

/**
 * Invoice/PDF readiness research follow-up — robustness coverage for
 * unusually long/multi-line seller and payment content, against the exact
 * same renderer Production issuance uses (renderInvoicePdfBuffer /
 * InvoicePdfDocument, src/lib/invoices/pdf/document.tsx). No separate
 * rendering path is introduced.
 *
 * VISUAL-EVIDENCE BOUNDARY (read before extending this file): this
 * repository has no PDF-parsing dependency (see buffer-validation.ts's
 * own header comment — a deliberate scope decision), so no plain-text
 * marker string can be reliably located inside the rendered output. Two
 * things were empirically confirmed while writing this file, not assumed:
 *   1. @react-pdf/renderer's content streams are FlateDecode-compressed
 *      by default — a marker string is not a raw substring of the PDF
 *      bytes even before considering font encoding.
 *   2. Even after manually zlib-inflating every stream (using only
 *      Node's built-in zlib — no new dependency), the text operators
 *      reference *glyph indices* into the embedded NotoSans subset font
 *      (e.g. `[<0001> 0 <0002...>] TJ`), not the original characters —
 *      recovering the original string would require decoding that font's
 *      own cmap table, which is exactly the kind of real PDF-text-
 *      extraction capability this repo has deliberately never added.
 * So: no test below claims a specific marker string "is present" in the
 * rendered PDF. Every assertion here is a genuine behavioral property —
 * renders without throwing, produces a structurally valid PDF the
 * existing production validator accepts, is deterministic, and (via
 * buffer-size comparison, not text search) that a content-bearing branch
 * actually executed rather than silently no-op'ing. Confirming that long
 * seller/payment text is *legible and correctly laid out* — including
 * whether it visibly overflows a page — still requires the human visual
 * PDF review already identified as a separate, later step; nothing here
 * claims otherwise.
 *
 * CONFIRMED DEFECT AND FIX (owner visual-review follow-up): the
 * observation this file originally reported here as an unproven,
 * unasserted hypothesis was subsequently confirmed by the owner's actual
 * visual review of a rendered PDF — an oversized `payment`/`notes`
 * section (individually taller than one full page) did not paginate;
 * instead, the entire page's layout corrupted (seller/date/recipient
 * blocks overlapping each other), even though `validatePdfBuffer()`
 * still reported the bytes as a structurally valid PDF. This is the
 * concrete case the "byte-level validity is insufficient" framing in
 * this follow-up's own task refers to.
 *
 * Root cause, confirmed by rendering real pages to images locally (a
 * Swift/PDFKit rasterizer, used only as an ad hoc local diagnostic tool —
 * never added to this repo or its CI, since it's macOS-only) and by a
 * binary-search over payment-instructions length: `document.tsx`'s
 * `notes`/`payment` sections were each a `wrap={false}` View. `wrap=
 * {false}` correctly pushes an unsplittable block to a fresh page when it
 * doesn't fit the current page's remaining space (proven safe by
 * scenario 6/8 below at moderate lengths) — but once that same
 * unsplittable block's own content is taller than one entire page, there
 * is no next page it can be "pushed to" that would fit it either, and
 * `@react-pdf/renderer`'s page-layout pass corrupts, not just for that
 * block but for other siblings on the page. The fix: removed `wrap=
 * {false}` from the `notes` and `payment` sections in document.tsx, so
 * they flow and split across pages like ordinary content instead of
 * being treated as one unsplittable unit. `totalsBlock` and each
 * `tableRow` deliberately keep their own `wrap={false}` — their content
 * is bounded (a handful of computed, always-short lines; a single line
 * item capped at 500 characters — see calculateInvoiceTotals's own
 * MAX_DESCRIPTION_LENGTH) and can never legally exceed one page, so there
 * is nothing unsafe about keeping them atomic.
 *
 * `countPageObjects()` below (a plain, portable regex over the
 * uncompressed PDF object structure — PDF page *objects* are never
 * FlateDecode-compressed, unlike the content streams discussed above; a
 * real, already-proven signal, per the existing 200-line-item fixture's
 * own many-page output) is used as a structural regression proxy: before
 * the fix, the confirmed-broken scenario below produced exactly one page
 * object; after the fix, it produces several. This proves pagination
 * occurred instead of a silent collapse — it does NOT independently
 * reprove the absence of overlap on each of those pages; that stronger
 * claim rests on the actual rendered-image review performed locally for
 * this fix (see the task's own final report) and, per this task's own
 * evidence boundary, still ultimately requires the owner's own visual
 * confirmation of the regenerated artifacts before this fix is
 * considered fully verified.
 */

function mustCalculate(input: InvoiceCalculationInput) {
  const result = calculateInvoiceTotals(input);
  if (!result.ok) throw new Error(`test fixture calculation failed: ${JSON.stringify(result.error)}`);
  return result;
}

const FLAT_CALCULATION = mustCalculate({
  subtotalSource: { mode: "flat", amount: "250.00" },
  discount: { type: "NONE" },
  taxRatePercent: null,
});

const SHORT_ISSUER: InvoicePdfIssuerPresentation = {
  legalName: "Acme Corp",
  address: { streetAddress: "1 Main St", city: "Springfield", state: "IL", postalCode: "62701" },
  country: "US",
  taxId: "12-3456789",
  supportEmail: "support@acme.test",
  phone: "+1-555-0100",
  website: "https://acme.test",
  brandColor: "#336699",
  payment: null,
  logoImage: null,
};

const SHORT_RECIPIENT: InvoicePdfRecipientPresentation = {
  billingName: "Jane Doe",
  email: "jane@example.test",
  address: { streetAddress: "2 Elm St", city: "Metropolis", state: "NY", postalCode: "10001" },
  country: "US",
  taxId: "98-7654321",
};

function baseInput(overrides: Partial<InvoicePdfBuildInput> = {}): InvoicePdfBuildInput {
  return {
    documentStatus: "SENT",
    invoiceNumber: "INV-LONG-100",
    issueDate: new Date("2026-08-17T00:00:00.000Z"),
    dueDate: new Date("2026-09-01T00:00:00.000Z"),
    currency: "USD",
    calculation: FLAT_CALCULATION,
    discountType: "NONE",
    discountValue: null,
    taxRatePercent: null,
    taxLabel: "TAX",
    notes: "Thank you for your business.",
    issuer: SHORT_ISSUER,
    recipient: SHORT_RECIPIENT,
    ...overrides,
  };
}

/** The one shared behavioral proof every scenario below must satisfy — reuses the real, existing production validator (validatePdfBuffer), never a reimplemented check. */
async function expectValidRender(input: InvoicePdfBuildInput): Promise<Buffer> {
  const viewModel = buildInvoicePdfViewModel(input);
  const buffer = await renderInvoicePdfBuffer(viewModel);
  expect(Buffer.isBuffer(buffer)).toBe(true);
  const validation = validatePdfBuffer(buffer);
  expect(validation).toEqual({ ok: true });
  expect(buffer.length).toBeGreaterThan(0);
  expect(buffer.length).toBeLessThan(MAX_PDF_BYTES);
  return buffer;
}

/**
 * A coarse, portable pagination signal — counts `/Type /Page` object
 * dictionaries in the PDF's own (uncompressed) object structure. Never a
 * text-content or visual-overlap claim (see this file's own header
 * comment) — only "did this content paginate across more than one page,
 * or collapse into one." Already proven meaningful by the pre-existing
 * 200-line-item fixture (invoice-pdf-document.test.tsx), whose own table
 * correctly produces many page objects.
 */
function countPageObjects(buffer: Buffer): number {
  const raw = buffer.toString("latin1");
  return (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

// 300 non-repeating-looking characters — long enough to genuinely stress
// single-line layout, short of anything that would trip a real app-level
// length limit (none exists for OrganizationProfile.legalName today; see
// this file's own header comment on why an unbounded-but-realistic value
// was chosen over the field's own, nonexistent ceiling).
const LONG_LEGAL_NAME =
  "Consolidated International Holdings & Multinational Ventures Group, a Delaware Limited Liability Company operating under the trade name Acme Worldwide Professional Services and Advisory Partners LLC";

const LONG_STREET_ADDRESS = "Suite 4500, The Grand Millennium Tower, 1 Boulevard of the Allies at the Corner of Fifth and Grant, Building C, Floor 45";
const LONG_CITY = "Winnemucca-Battle Mountain-Eureka Consolidated Metropolitan Statistical Area";
const LONG_STATE = "Commonwealth of the Northern Mariana Islands (Unincorporated Territory)";
const LONG_POSTAL_CODE = "SW1A-0AA-EXTENDED-9999";
const LONG_COUNTRY = "United Kingdom of Great Britain and Northern Ireland";

const LONG_BANK_NAME = "The Consolidated Trust and Savings Bank of the Federated International Commonwealth, N.A.";
const LONG_ACCOUNT_HOLDER = "Consolidated International Holdings & Multinational Ventures Group (Trading as Acme Worldwide)";
const LONG_ACCOUNT_NUMBER = "GB94BARC10201530093459-EXTENDED-REFERENCE-0000000000000001";
const LONG_SWIFT_BIC = "BARCGB22XXXEXTENDEDBIC";

const LONG_PAYMENT_INSTRUCTIONS =
  "Please remit payment in full within the agreed terms. ".repeat(20).trim();

const MULTILINE_PAYMENT_INSTRUCTIONS = [
  "Please remit payment via wire transfer only — no checks accepted.",
  "Reference invoice number in the wire memo field, exactly as printed above.",
  "A confirmation email is required within 24 hours of transfer.",
  "For questions, contact the billing department directly, not the account manager.",
  "International wires must include full correspondent bank details.",
].join("\n");

// The exact shape of content that reproduced the confirmed defect during
// the owner's visual review: several realistic paragraphs, repeated
// enough times that the payment section's own rendered height exceeds a
// single A4 page — genuinely multi-line, wrapping content (unlike
// LONG_NOTES below, whose single 10,000-character unbroken "word" never
// grows tall regardless of length, since there is no space to wrap on).
// Repeated 6 times to comfortably clear the threshold empirically found
// while investigating this defect (4 repeats already reproduced it) —
// not chosen to be barely-above-threshold, so this stays a robust
// regression guard rather than a fragile one.
const DEFECT_REPRO_PARAGRAPHS = [
  "Please remit payment via wire transfer only — no checks, cash, or third-party payment apps are accepted for this account under any circumstances.",
  "Reference the invoice number shown above in the wire memo field exactly as printed, including the leading letters, so our accounting team can reconcile your payment without delay.",
  "A confirmation email including your bank's wire transfer reference number is required within 24 hours of sending payment; please send it to billing@synthetic-fixture.test with the invoice number in the subject line.",
  "For international wires, please ensure your bank includes full correspondent bank details (SWIFT/BIC, intermediary bank name and address, and any applicable routing information), as incomplete wires are frequently delayed, rejected, or returned by our receiving bank, which can result in a delay to your service.",
];
const EXTREME_MULTILINE_PAYMENT_INSTRUCTIONS = Array.from({ length: 6 }, () => DEFECT_REPRO_PARAGRAPHS.join("\n\n")).join("\n\n---\n\n");

const LONG_NOTES = "N".repeat(INVOICE_NOTES_MAX_LENGTH);

describe("invoice PDF renderer — long/multi-line seller and payment content", () => {
  it("scenario 1: a very long legal/company name renders without throwing, to a valid PDF", async () => {
    await expectValidRender(baseInput({ issuer: { ...SHORT_ISSUER, legalName: LONG_LEGAL_NAME } }));
  });

  it("scenario 2: long street/address fields render without throwing, to a valid PDF", async () => {
    await expectValidRender(
      baseInput({
        issuer: {
          ...SHORT_ISSUER,
          address: { streetAddress: LONG_STREET_ADDRESS, city: LONG_CITY, state: LONG_STATE, postalCode: LONG_POSTAL_CODE },
          country: LONG_COUNTRY,
        },
      }),
    );
  });

  it("scenario 3: a fully multi-line address composition (street + city/state/postal + country all long) renders without throwing", async () => {
    const buffer = await expectValidRender(
      baseInput({
        issuer: {
          ...SHORT_ISSUER,
          address: { streetAddress: LONG_STREET_ADDRESS, city: LONG_CITY, state: LONG_STATE, postalCode: LONG_POSTAL_CODE },
          country: LONG_COUNTRY,
        },
        recipient: {
          ...SHORT_RECIPIENT,
          address: { streetAddress: LONG_STREET_ADDRESS, city: LONG_CITY, state: LONG_STATE, postalCode: LONG_POSTAL_CODE },
          country: LONG_COUNTRY,
        },
      }),
    );
    // A weak but real behavioral proxy for "more address content actually
    // rendered" — never a claim that the specific text is legible (see
    // this file's own header comment on why text-content extraction is
    // not reliable here).
    const shortBaseline = await expectValidRender(baseInput());
    expect(buffer.length).toBeGreaterThan(shortBaseline.length);
  });

  it("scenario 4: long account-holder/bank-related display text (bank name, account holder, account number, SWIFT/BIC) renders without throwing", async () => {
    await expectValidRender(
      baseInput({
        issuer: {
          ...SHORT_ISSUER,
          payment: {
            bankName: LONG_BANK_NAME,
            accountHolder: LONG_ACCOUNT_HOLDER,
            accountNumber: LONG_ACCOUNT_NUMBER,
            swiftBic: LONG_SWIFT_BIC,
            paymentInstructions: null,
          },
        },
      }),
    );
  });

  it("scenario 5: long single-line payment instructions render without throwing", async () => {
    await expectValidRender(
      baseInput({
        issuer: {
          ...SHORT_ISSUER,
          payment: { bankName: "First Bank", accountHolder: "Acme Corp", accountNumber: "000123456", swiftBic: "FBUS1234", paymentInstructions: LONG_PAYMENT_INSTRUCTIONS },
        },
      }),
    );
  });

  it("scenario 6: multi-line (embedded newline) payment instructions render without throwing", async () => {
    await expectValidRender(
      baseInput({
        issuer: {
          ...SHORT_ISSUER,
          payment: { bankName: "First Bank", accountHolder: "Acme Corp", accountNumber: "000123456", swiftBic: "FBUS1234", paymentInstructions: MULTILINE_PAYMENT_INSTRUCTIONS },
        },
      }),
    );
  });

  it("regression: payment instructions taller than one full page now paginate onto multiple pages, instead of collapsing into a single corrupted page (the confirmed owner-visual-review defect)", async () => {
    const buffer = await expectValidRender(
      baseInput({
        issuer: {
          ...SHORT_ISSUER,
          payment: { bankName: "First Bank", accountHolder: "Acme Corp", accountNumber: "000123456", swiftBic: "FBUS1234", paymentInstructions: EXTREME_MULTILINE_PAYMENT_INSTRUCTIONS },
        },
      }),
    );
    // Before the fix, this exact scenario produced exactly one /Type
    // /Page object despite the content clearly being taller than one
    // page — the hallmark of the confirmed collapse-instead-of-paginate
    // defect. After the fix, it must produce more than one.
    expect(countPageObjects(buffer)).toBeGreaterThan(1);
  });

  it("scenario 7: notes at the exact currently-enforced maximum length (INVOICE_NOTES_MAX_LENGTH) render without throwing", async () => {
    expect(LONG_NOTES).toHaveLength(INVOICE_NOTES_MAX_LENGTH);
    await expectValidRender(baseInput({ notes: LONG_NOTES }));
  });

  it("scenario 8: combined stress case — every long/multi-line value simultaneously, including payment instructions taller than one page — renders without throwing, to a valid, deterministic, correctly-paginating PDF, and both the payment section and unrelated sections still contribute content", async () => {
    const stressInput = baseInput({
      issuer: {
        ...SHORT_ISSUER,
        legalName: LONG_LEGAL_NAME,
        address: { streetAddress: LONG_STREET_ADDRESS, city: LONG_CITY, state: LONG_STATE, postalCode: LONG_POSTAL_CODE },
        country: LONG_COUNTRY,
        payment: {
          bankName: LONG_BANK_NAME,
          accountHolder: LONG_ACCOUNT_HOLDER,
          accountNumber: LONG_ACCOUNT_NUMBER,
          swiftBic: LONG_SWIFT_BIC,
          paymentInstructions: EXTREME_MULTILINE_PAYMENT_INSTRUCTIONS,
        },
      },
      recipient: {
        ...SHORT_RECIPIENT,
        address: { streetAddress: LONG_STREET_ADDRESS, city: LONG_CITY, state: LONG_STATE, postalCode: LONG_POSTAL_CODE },
        country: LONG_COUNTRY,
      },
      notes: LONG_NOTES,
    });

    const stressed = await expectValidRender(stressInput);

    // The combined stress case now correctly paginates rather than
    // collapsing (see the dedicated regression test above for the
    // isolated, minimal reproduction of this same defect).
    expect(countPageObjects(stressed)).toBeGreaterThan(1);

    // Determinism: the exact same stressed input renders to the exact same
    // byte length on a second, independent render. Not full byte-for-byte
    // equality — empirically confirmed (while writing this test) that
    // @react-pdf/renderer's PDFKit backend writes a randomly-generated
    // trailer `/ID` pair on every render (standard, spec-permitted PDF
    // behavior, unrelated to this feature's own content) — the *content*
    // itself (everything before the trailer) is what must stay stable,
    // and identical length is strong evidence of that without depending
    // on the one deliberately-random trailer field.
    const stressedAgain = await expectValidRender(stressInput);
    expect(stressedAgain.length).toBe(stressed.length);

    // The payment section still contributes content (a size-based proxy,
    // not a text-content claim — see this file's own header comment):
    // the same stress scenario with payment forced to null must produce a
    // measurably smaller buffer, proving the payment-rendering branch is
    // not a silent no-op regardless of how long its own content is.
    const withoutPayment = await expectValidRender({ ...stressInput, issuer: { ...stressInput.issuer, payment: null } });
    expect(stressed.length).toBeGreaterThan(withoutPayment.length);

    // Unrelated sections (notes) still contribute content alongside the
    // stressed seller/payment fields — same proxy technique.
    const withoutNotes = await expectValidRender({ ...stressInput, notes: null });
    expect(stressed.length).toBeGreaterThan(withoutNotes.length);
  });
});
