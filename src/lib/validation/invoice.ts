import type { InvoiceFormState } from "@/types";

export const INVOICE_STATUSES = [
  "DRAFT",
  "SENT",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;
export type InvoiceStatusValue = (typeof INVOICE_STATUSES)[number];

export type ParsedInvoiceInput = {
  invoiceNumber: string;
  projectId: string;
  amount: string;
  status: InvoiceStatusValue;
  dueDate: Date | null;
  notes: string | null;
};

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseInvoiceForm(formData: FormData): {
  values: ParsedInvoiceInput;
  fieldErrors: NonNullable<InvoiceFormState["fieldErrors"]>;
} {
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const status = String(formData.get("status") ?? "DRAFT");
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const fieldErrors: NonNullable<InvoiceFormState["fieldErrors"]> = {};

  if (!invoiceNumber) {
    fieldErrors.invoiceNumber = "Invoice number is required.";
  }

  if (!projectId) {
    fieldErrors.projectId = "Select a project.";
  }

  const amountNum = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amountNum) || amountNum <= 0) {
    fieldErrors.amount = "Enter an amount greater than zero.";
  }

  const isValidStatus = INVOICE_STATUSES.includes(
    status as InvoiceStatusValue,
  );
  if (!isValidStatus) {
    fieldErrors.status = "Select a valid status.";
  }

  if (dueDateRaw && !parseDate(dueDateRaw)) {
    fieldErrors.dueDate = "Enter a valid due date.";
  }

  return {
    values: {
      invoiceNumber,
      projectId,
      amount: amountRaw,
      status: isValidStatus ? (status as InvoiceStatusValue) : "DRAFT",
      dueDate: parseDate(dueDateRaw),
      notes: notes || null,
    },
    fieldErrors,
  };
}
