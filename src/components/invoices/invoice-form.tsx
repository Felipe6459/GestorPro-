"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { INVOICE_STATUSES } from "@/lib/validation/invoice";
import type { InvoiceFormState } from "@/types";

const initialState: InvoiceFormState = { error: null };

type InvoiceFormDefaults = {
  invoiceNumber?: string;
  projectId?: string;
  amount?: string;
  status?: string;
  dueDate?: string;
  notes?: string;
};

export function InvoiceForm({
  action,
  projects,
  defaultValues,
  submitLabel = "Create invoice",
  pendingLabel = "Creating…",
}: {
  action: (
    prevState: InvoiceFormState,
    formData: FormData,
  ) => Promise<InvoiceFormState>;
  projects: { id: string; label: string }[];
  defaultValues?: InvoiceFormDefaults;
  submitLabel?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormField
        label="Invoice number"
        htmlFor="invoiceNumber"
        required
        error={state.fieldErrors?.invoiceNumber}
      >
        <Input
          id="invoiceNumber"
          name="invoiceNumber"
          defaultValue={defaultValues?.invoiceNumber}
          required
          aria-invalid={!!state.fieldErrors?.invoiceNumber}
          aria-describedby={
            state.fieldErrors?.invoiceNumber ? "invoiceNumber-error" : undefined
          }
        />
      </FormField>

      <FormField
        label="Project"
        htmlFor="projectId"
        required
        error={state.fieldErrors?.projectId}
      >
        <Select
          id="projectId"
          name="projectId"
          defaultValue={defaultValues?.projectId ?? ""}
          required
          aria-invalid={!!state.fieldErrors?.projectId}
          aria-describedby={
            state.fieldErrors?.projectId ? "projectId-error" : undefined
          }
        >
          <option value="" disabled>
            Select a project
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Amount"
        htmlFor="amount"
        required
        error={state.fieldErrors?.amount}
      >
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={defaultValues?.amount}
          required
          aria-invalid={!!state.fieldErrors?.amount}
          aria-describedby={
            state.fieldErrors?.amount ? "amount-error" : undefined
          }
        />
      </FormField>

      <FormField label="Status" htmlFor="status" error={state.fieldErrors?.status}>
        <Select
          id="status"
          name="status"
          defaultValue={defaultValues?.status ?? "DRAFT"}
          aria-invalid={!!state.fieldErrors?.status}
          aria-describedby={
            state.fieldErrors?.status ? "status-error" : undefined
          }
        >
          {INVOICE_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Due date"
        htmlFor="dueDate"
        error={state.fieldErrors?.dueDate}
      >
        <Input
          id="dueDate"
          name="dueDate"
          type="date"
          defaultValue={defaultValues?.dueDate ?? ""}
          aria-invalid={!!state.fieldErrors?.dueDate}
          aria-describedby={
            state.fieldErrors?.dueDate ? "dueDate-error" : undefined
          }
        />
      </FormField>

      <FormField label="Notes" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes ?? ""}
        />
      </FormField>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
