import type { CompanyProfileFormState } from "@/types";

export type ParsedCompanyProfileInput = {
  legalName: string;
  displayName: string;
  country: string;
  currency: string;
  timezone: string;
};

// Real platform data, not a hand-maintained list — see
// src/lib/organization-setup/company-profile.ts's own schema comment for
// why this is validated in code (Intl) rather than a Prisma enum.
const VALID_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export function getSupportedCurrencies(): readonly string[] {
  return Array.from(VALID_CURRENCIES).sort();
}

export function getSupportedTimezones(): readonly string[] {
  return Array.from(VALID_TIMEZONES).sort();
}

export function parseCompanyProfileForm(formData: FormData): {
  values: ParsedCompanyProfileInput;
  fieldErrors: NonNullable<CompanyProfileFormState["fieldErrors"]>;
} {
  const legalName = String(formData.get("legalName") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const timezone = String(formData.get("timezone") ?? "").trim();

  const fieldErrors: NonNullable<CompanyProfileFormState["fieldErrors"]> = {};

  if (!legalName) {
    fieldErrors.legalName = "Legal company name is required.";
  }
  if (!displayName) {
    fieldErrors.displayName = "Display name is required.";
  }
  if (!country) {
    fieldErrors.country = "Country is required.";
  }
  if (!currency || !VALID_CURRENCIES.has(currency)) {
    fieldErrors.currency = "Select a valid currency.";
  }
  if (!timezone || !VALID_TIMEZONES.has(timezone)) {
    fieldErrors.timezone = "Select a valid time zone.";
  }

  return { values: { legalName, displayName, country, currency, timezone }, fieldErrors };
}
