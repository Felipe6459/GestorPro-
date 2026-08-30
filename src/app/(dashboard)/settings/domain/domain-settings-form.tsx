"use client";

import { useActionState } from "react";
import { updateDomainSettingsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";
import type { DomainSettingsFormState } from "@/types";
import type { DomainSettingsData } from "@/lib/organization-setup/domain-settings";

const initialState: DomainSettingsFormState = { error: null };

export function DomainSettingsForm({ settings }: { settings: DomainSettingsData }) {
  const [state, formAction, pending] = useActionState(updateDomainSettingsAction, initialState);

  return (
    <form action={formAction} className={`mt-6 space-y-4 p-6 ${CARD_SURFACE_CLASSES}`}>
      <FormField label="Custom domain" htmlFor="customDomain" error={state.fieldErrors?.customDomain}>
        <Input
          id="customDomain"
          name="customDomain"
          type="text"
          placeholder="custom-domain.com"
          defaultValue={settings.customDomain ?? ""}
          aria-invalid={!!state.fieldErrors?.customDomain}
        />
      </FormField>

      {settings.customDomain && settings.verificationStatus && (
        <p className="text-text-secondary flex items-center gap-2 text-sm">
          Current status: <StatusBadge status={settings.verificationStatus} />
        </p>
      )}
      <p className="text-text-muted text-xs">
        Leave blank to use the generated subdomain only. Domain verification isn&apos;t available yet — a custom domain
        is saved as pending.
      </p>

      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-success text-sm">
          {state.message}
        </p>
      )}

      <Button type="submit" loading={pending}>
        {pending ? "Saving…" : "Save domain settings"}
      </Button>
    </form>
  );
}
