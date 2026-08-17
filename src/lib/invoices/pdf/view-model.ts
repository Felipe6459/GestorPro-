import "server-only";
import { Prisma } from "@/generated/prisma/browser";
import { formatInvoiceCurrencyAmount } from "@/lib/invoices/currencies";
import { formatDateOnlyForDisplay } from "@/lib/invoices/date-only";
import { buildInvoiceTotalsViewModel, type InvoiceTotalsInput, type InvoiceTotalsViewModel } from "@/lib/invoices/totals-view-model";
import type { AllowedLogoContentType, InvoiceIssuerSnapshotV1, InvoiceRecipientSnapshotV1 } from "./snapshot-types";

/**
 * Invoice System Official Slice 3, sub-PR 3a — the immutable PDF's
 * renderer-safe view model ("Second Corrected Design Report" §7). This
 * module is Node-only (it builds `Buffer`-backed data URIs) but carries no
 * secret of its own — `import "server-only"` is present per this sub-PR's
 * explicit scope, not because a bare Node-only marker would be
 * insufficient on its own.
 *
 * CRITICAL BOUNDARY: `InvoicePdfViewModel` and its nested presentation
 * types are the ONLY shape `document.tsx` ever receives. They are built
 * here, once, from a persisted `InvoiceIssuerSnapshotV1`/
 * `InvoiceRecipientSnapshotV1` (which DO carry Storage provenance) via an
 * explicit mapping step that structurally drops that provenance — the
 * renderer-safe types below have no field capable of holding a Storage
 * bucket, path, SHA-256, provider/public/signed URL, internal ID, raw
 * error, or `internalNotes`. This is a compile-time guarantee, not a
 * runtime scrub: it is enforced by these types simply never declaring
 * such a field, not by an omission-and-hope step.
 */

const PDF_LOCALE = "en-US";

type Decimal = InstanceType<typeof Prisma.Decimal>;
type MoneyValue = Decimal | string | number;

function formatMoney(value: MoneyValue, currency: string): string {
  return formatInvoiceCurrencyAmount(value, currency, PDF_LOCALE) ?? String(value);
}

// ---------------------------------------------------------------------------
// Renderer-safe presentation types — the only shapes document.tsx accepts.
// ---------------------------------------------------------------------------

export type InvoicePdfAddress = {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export type InvoicePdfPaymentInstructions = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  swiftBic: string;
  paymentInstructions: string | null;
} | null;

export type InvoicePdfIssuerPresentation = {
  legalName: string;
  address: InvoicePdfAddress;
  country: string | null;
  taxId: string | null;
  supportEmail: string | null;
  phone: string | null;
  website: string | null;
  brandColor: string | null;
  payment: InvoicePdfPaymentInstructions;
  /** Already-validated logo bytes, inlined as a data URI — never a bucket/path/URL of any kind. */
  logoImage: { dataUri: string } | null;
};

export type InvoicePdfRecipientPresentation = {
  billingName: string;
  email: string | null;
  address: InvoicePdfAddress;
  country: string | null;
  taxId: string | null;
};

export type InvoicePdfLineItem = {
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

/**
 * `documentStatus` is always an explicit, server-derived value supplied by
 * the caller — never read from any `Invoice.status` field embedded in this
 * type, because no such field exists here. At Issue time the source row
 * is still genuinely DRAFT in the database (the DB transition to SENT
 * only happens after rendering completes) — the caller must pass the
 * literal target status ("SENT") explicitly; this type has no way to
 * "blindly copy" a DRAFT value because it never accepts one.
 */
export type InvoicePdfViewModel = {
  documentStatus: "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  invoiceNumber: string;
  currency: string;
  issueDateDisplay: string;
  dueDateDisplay: string | null;
  issuer: InvoicePdfIssuerPresentation;
  recipient: InvoicePdfRecipientPresentation;
  lineItems: InvoicePdfLineItem[];
  /** True only for the single synthetic "Services" row case — never persisted as a real InvoiceLineItem row. */
  isFlatSynthetic: boolean;
  totals: InvoiceTotalsViewModel;
  notes: string | null;
};

// ---------------------------------------------------------------------------
// Mapping: persisted snapshot -> renderer-safe presentation.
// ---------------------------------------------------------------------------

export function toRendererIssuerPresentation(
  snapshot: InvoiceIssuerSnapshotV1,
  logoBytes: { data: Buffer; contentType: AllowedLogoContentType } | null,
): InvoicePdfIssuerPresentation {
  return {
    legalName: snapshot.legalName,
    address: { ...snapshot.address },
    country: snapshot.country,
    taxId: snapshot.taxId,
    supportEmail: snapshot.supportEmail,
    phone: snapshot.phone,
    website: snapshot.website,
    brandColor: snapshot.brandColor,
    payment: snapshot.payment ? { ...snapshot.payment } : null,
    // snapshot.logo (bucket/path/sha256 provenance) is intentionally never
    // read here — logoBytes (already-fetched, already-validated) is the
    // sole source of the renderer-facing image.
    logoImage: logoBytes ? { dataUri: `data:${logoBytes.contentType};base64,${logoBytes.data.toString("base64")}` } : null,
  };
}

export function toRendererRecipientPresentation(snapshot: InvoiceRecipientSnapshotV1): InvoicePdfRecipientPresentation {
  return {
    billingName: snapshot.billingName,
    email: snapshot.email,
    address: { ...snapshot.address },
    country: snapshot.country,
    taxId: snapshot.taxId,
  };
}

// ---------------------------------------------------------------------------
// The main view-model builder.
// ---------------------------------------------------------------------------

export type InvoicePdfLineItemInput = { description: string; quantity: MoneyValue; unitPrice: MoneyValue; lineTotal: MoneyValue };

export type InvoicePdfBuildInput = {
  /** Explicit, server-derived target status — see InvoicePdfViewModel's own header comment. Never derived from any source row's own `.status`. */
  documentStatus: "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  /** Real itemized rows in persisted order, already computed — empty array means a flat invoice. This builder never recalculates lineTotal/aggregate totals; it only formats already-validated Decimal values. */
  lineItems: InvoicePdfLineItemInput[];
  /** Used only when `lineItems` is empty, to build the single synthetic "Services" row — never itself treated as a persisted line item. */
  flatAmount: MoneyValue;
  /** Already recomputed/validated totals — reuses the exact same presentation rules as the read-only view via buildInvoiceTotalsViewModel(). */
  totals: InvoiceTotalsInput;
  notes: string | null;
  issuer: InvoicePdfIssuerPresentation;
  recipient: InvoicePdfRecipientPresentation;
};

export function buildInvoicePdfViewModel(input: InvoicePdfBuildInput): InvoicePdfViewModel {
  const currency = input.totals.currency;
  const isFlatSynthetic = input.lineItems.length === 0;

  const lineItems: InvoicePdfLineItem[] = isFlatSynthetic
    ? [
        {
          description: "Services",
          quantity: "1",
          unitPrice: formatMoney(input.flatAmount, currency),
          lineTotal: formatMoney(input.flatAmount, currency),
        },
      ]
    : input.lineItems.map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: formatMoney(item.unitPrice, currency),
        lineTotal: formatMoney(item.lineTotal, currency),
      }));

  return {
    documentStatus: input.documentStatus,
    invoiceNumber: input.invoiceNumber,
    currency,
    issueDateDisplay: formatDateOnlyForDisplay(input.issueDate, PDF_LOCALE),
    dueDateDisplay: input.dueDate ? formatDateOnlyForDisplay(input.dueDate, PDF_LOCALE) : null,
    issuer: input.issuer,
    recipient: input.recipient,
    lineItems,
    isFlatSynthetic,
    totals: buildInvoiceTotalsViewModel(input.totals),
    notes: input.notes,
  };
}
