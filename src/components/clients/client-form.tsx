"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { CLIENT_STATUSES } from "@/lib/validation/client";
import type { ClientFormState } from "@/types";

const initialState: ClientFormState = { error: null };

type ClientFormDefaults = {
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
};

export function ClientForm({
  action,
  defaultValues,
  submitLabel = "Create client",
  pendingLabel = "Creating…",
}: {
  action: (
    prevState: ClientFormState,
    formData: FormData,
  ) => Promise<ClientFormState>;
  defaultValues?: ClientFormDefaults;
  submitLabel?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormField label="Name" htmlFor="name" required error={state.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          defaultValue={defaultValues?.name}
          required
          aria-invalid={!!state.fieldErrors?.name}
          aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
        />
      </FormField>

      <FormField label="Company" htmlFor="company">
        <Input
          id="company"
          name="company"
          defaultValue={defaultValues?.company ?? ""}
        />
      </FormField>

      <FormField label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaultValues?.email ?? ""}
          aria-invalid={!!state.fieldErrors?.email}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
      </FormField>

      <FormField label="Phone" htmlFor="phone">
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaultValues?.phone ?? ""}
        />
      </FormField>

      <FormField label="Status" htmlFor="status" error={state.fieldErrors?.status}>
        <Select
          id="status"
          name="status"
          defaultValue={defaultValues?.status ?? "LEAD"}
          aria-invalid={!!state.fieldErrors?.status}
          aria-describedby={state.fieldErrors?.status ? "status-error" : undefined}
        >
          {CLIENT_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
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
