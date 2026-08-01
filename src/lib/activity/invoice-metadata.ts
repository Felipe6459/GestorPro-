// Fields tracked for change-detection on Invoice Activity — deliberately a
// subset of the actual Invoice model. currency is a real, always-shown
// metadata field but is never diffed here: no form or action in this app
// currently reads or writes it (Invoice.currency always defaults to
// "USD"), so there's nothing to compare it against. notes and full form
// payloads are never included at all.
const INVOICE_TRACKED_FIELDS = ["invoiceNumber", "projectId", "amount", "status", "dueDate"] as const;

type InvoiceTrackedSnapshot = {
  invoiceNumber: string;
  projectId: string;
  // Prisma.Decimal on the "before" (DB) side, a plain numeric string on the
  // "after" (form) side — compared numerically in fieldEqual, never by
  // object identity or string shape.
  amount: unknown;
  status: string;
  dueDate: Date | null;
};

function fieldEqual(
  field: (typeof INVOICE_TRACKED_FIELDS)[number],
  a: unknown,
  b: unknown,
): boolean {
  if (field === "dueDate") {
    const at = a instanceof Date ? a.getTime() : null;
    const bt = b instanceof Date ? b.getTime() : null;
    return at === bt;
  }
  if (field === "amount") {
    return Number(String(a)) === Number(String(b));
  }
  return a === b;
}

/**
 * Field names (never values) that differ between two Invoice snapshots.
 * May include "status" — callers split that out into its own
 * STATUS_CHANGED event rather than listing it in an UPDATED event's
 * changedFields (see updateInvoiceAction).
 */
export function diffInvoiceFields(
  before: InvoiceTrackedSnapshot,
  after: InvoiceTrackedSnapshot,
): string[] {
  return INVOICE_TRACKED_FIELDS.filter((field) => !fieldEqual(field, before[field], after[field]));
}

type InvoiceSnapshotMetadata = {
  invoiceNumber: string;
  status: string;
  amount: string;
  currency: string;
  projectName: string;
  actorName: string;
};

type InvoiceValueSnapshot = {
  invoiceNumber: string;
  status: string;
  amount: unknown;
  currency: string;
};

/** Shared shape for CREATED and DELETED — a full snapshot, no diff. */
export function buildInvoiceMetadata(
  invoice: InvoiceValueSnapshot,
  projectName: string,
  actorName: string,
): InvoiceSnapshotMetadata {
  return {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    amount: String(invoice.amount),
    currency: invoice.currency,
    projectName,
    actorName,
  };
}

export type InvoiceStatusChangedMetadata = {
  invoiceNumber: string;
  projectName: string;
  from: string;
  to: string;
  actorName: string;
};

export function buildInvoiceStatusChangedMetadata(
  invoice: Pick<InvoiceValueSnapshot, "invoiceNumber">,
  projectName: string,
  from: string,
  to: string,
  actorName: string,
): InvoiceStatusChangedMetadata {
  return { invoiceNumber: invoice.invoiceNumber, projectName, from, to, actorName };
}

export type InvoiceUpdatedMetadata = {
  invoiceNumber: string;
  status: string;
  amount: string;
  currency: string;
  projectName: string;
  changedFields: string[];
  actorName: string;
};

/** changedFields must already have "status" filtered out by the caller. */
export function buildInvoiceUpdatedMetadata(
  invoice: InvoiceValueSnapshot,
  projectName: string,
  changedFields: string[],
  actorName: string,
): InvoiceUpdatedMetadata {
  return {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    amount: String(invoice.amount),
    currency: invoice.currency,
    projectName,
    changedFields,
    actorName,
  };
}
