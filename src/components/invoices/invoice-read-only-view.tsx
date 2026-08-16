import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatInvoiceStatusLabel } from "@/lib/invoices/status-label";
import { formatInvoiceCurrencyAmount } from "@/lib/invoices/currencies";
import { InvoiceLifecycleControls } from "./invoice-lifecycle-controls";
import { InvoiceInternalNotesForm } from "./invoice-internal-notes-form";
import type { InvoiceStatusValue } from "@/lib/validation/invoice";

type MoneyValue = Prisma.Decimal | string | number;

export type InvoiceTotalsInput = {
  amount: MoneyValue;
  subtotal: MoneyValue | null;
  discountType: string;
  discountAmount: MoneyValue | null;
  discountValue: MoneyValue | null;
  taxRatePercent: MoneyValue | null;
  taxAmount: MoneyValue | null;
  taxLabel: string;
  currency: string;
};

export type InvoiceTotalsViewModel = {
  displayedSubtotal: string;
  discountRow: { label: string; amount: string } | null;
  taxRow: { label: string; amount: string } | null;
  total: string;
};

/**
 * Invoice System Slice 2b legacy-total display contract. `amount` is the
 * one field guaranteed non-null for every invoice ever created —
 * `subtotal` only exists from Slice 1 onward and, for a flat invoice, is
 * defined to equal `amount` once populated, so falling back to `amount`
 * is never even approximate, it's exact. No zero value is ever invented:
 * discount/tax rows are omitted entirely (not "$0.00") whenever the
 * persisted value is null or carries no real information (NONE-type
 * discount, absent tax).
 */
export function buildInvoiceTotalsViewModel(invoice: InvoiceTotalsInput): InvoiceTotalsViewModel {
  const format = (value: MoneyValue): string => formatInvoiceCurrencyAmount(value, invoice.currency) ?? String(value);

  const displayedSubtotal = format(invoice.subtotal ?? invoice.amount);

  const discountRow =
    invoice.discountAmount == null || invoice.discountType === "NONE"
      ? null
      : {
          label:
            invoice.discountType === "PERCENTAGE" && invoice.discountValue != null
              ? `Discount (${String(invoice.discountValue)}%)`
              : "Discount",
          amount: format(invoice.discountAmount),
        };

  const taxRow =
    invoice.taxAmount == null || invoice.taxRatePercent == null
      ? null
      : { label: `${invoice.taxLabel} (${String(invoice.taxRatePercent)}%)`, amount: format(invoice.taxAmount) };

  return { displayedSubtotal, discountRow, taxRow, total: format(invoice.amount) };
}

export type InvoiceReadOnlyLineItem = { description: string; quantity: MoneyValue; unitPrice: MoneyValue; lineTotal: MoneyValue };

/**
 * The complete visible contract for an existing non-DRAFT invoice
 * (docs/invoicing-architecture.md §4.6). Every non-DRAFT invoice at this
 * point in the roadmap is "legacy unarchived historical" — finalizedAt/
 * pdfStoragePath are both null by construction, since nothing writes them
 * until Slice 3. This view never claims a PDF/archive exists, never
 * fabricates a line item for a flat invoice, and renders no editable
 * frozen field, Delete, Duplicate, Issue, Send, PDF/download, or email
 * control.
 */
export function InvoiceReadOnlyView({
  invoiceId,
  invoiceNumber,
  status,
  projectName,
  clientName,
  currency,
  issueDate,
  dueDate,
  paidAt,
  lineItems,
  notes,
  internalNotes,
  totals,
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: InvoiceStatusValue;
  projectName: string;
  clientName: string;
  currency: string;
  issueDate: Date;
  dueDate: Date | null;
  paidAt: Date | null;
  lineItems: InvoiceReadOnlyLineItem[];
  notes: string | null;
  internalNotes: string | null;
  totals: InvoiceTotalsViewModel;
}) {
  const format = (value: MoneyValue) => formatInvoiceCurrencyAmount(value, currency) ?? String(value);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{invoiceNumber}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {projectName} — {clientName}
          </p>
        </div>
        <StatusBadge status={status} label={formatInvoiceStatusLabel(status)} />
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gray-500">Currency</dt>
          <dd className="mt-0.5 text-gray-900">{currency}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Issue date</dt>
          <dd className="mt-0.5 text-gray-900">{issueDate.toLocaleDateString()}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Due date</dt>
          <dd className="mt-0.5 text-gray-900">{dueDate ? dueDate.toLocaleDateString() : "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Paid date</dt>
          <dd className="mt-0.5 text-gray-900">{paidAt ? paidAt.toLocaleDateString() : "—"}</dd>
        </div>
      </dl>

      {lineItems.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Description</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Qty</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Unit price</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="px-3 py-2 text-gray-900">{item.description}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{String(item.quantity)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{format(item.unitPrice)}</td>
                  <td className="px-3 py-2 text-right text-gray-900">{format(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Subtotal</span>
          <span className="text-gray-900">{totals.displayedSubtotal}</span>
        </div>
        {totals.discountRow && (
          <div className="flex justify-between">
            <span className="text-gray-500">{totals.discountRow.label}</span>
            <span className="text-gray-900">-{totals.discountRow.amount}</span>
          </div>
        )}
        {totals.taxRow && (
          <div className="flex justify-between">
            <span className="text-gray-500">{totals.taxRow.label}</span>
            <span className="text-gray-900">{totals.taxRow.amount}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-200 pt-1 font-medium">
          <span className="text-gray-900">Total</span>
          <span className="text-gray-900">{totals.total}</span>
        </div>
      </div>

      {notes && (
        <div>
          <h3 className="text-sm font-medium text-gray-700">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{notes}</p>
        </div>
      )}

      <InvoiceInternalNotesForm invoiceId={invoiceId} initialValue={internalNotes ?? ""} />

      <InvoiceLifecycleControls invoiceId={invoiceId} status={status} invoiceNumber={invoiceNumber} />
    </div>
  );
}
