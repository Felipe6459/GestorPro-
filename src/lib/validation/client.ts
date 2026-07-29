import type { ClientFormState } from "@/types";

export const CLIENT_STATUSES = ["LEAD", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export type ClientStatusValue = (typeof CLIENT_STATUSES)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedClientInput = {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: ClientStatusValue;
};

export function parseClientForm(formData: FormData): {
  values: ParsedClientInput;
  fieldErrors: NonNullable<ClientFormState["fieldErrors"]>;
} {
  const name = String(formData.get("name") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const status = String(formData.get("status") ?? "LEAD");

  const fieldErrors: NonNullable<ClientFormState["fieldErrors"]> = {};

  if (!name) {
    fieldErrors.name = "Name is required.";
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  const isValidStatus = CLIENT_STATUSES.includes(status as ClientStatusValue);
  if (!isValidStatus) {
    fieldErrors.status = "Select a valid status.";
  }

  return {
    values: {
      name,
      company: company || null,
      email: email || null,
      phone: phone || null,
      status: isValidStatus ? (status as ClientStatusValue) : "LEAD",
    },
    fieldErrors,
  };
}
