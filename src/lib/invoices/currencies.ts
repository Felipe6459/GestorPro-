/**
 * Invoice System Slice 1 — bounded invoice currency contract
 * (docs/invoicing-architecture.md §6). Deliberately narrower than
 * OrganizationProfile's own currency support (which accepts every
 * `Intl.supportedValuesOf("currency")` value, src/lib/validation/
 * company-profile.ts:31) — this app's `Decimal(10,2)` money columns
 * structurally assume exactly 2 decimal places everywhere, so a
 * zero-decimal currency (e.g. JPY) or three-decimal currency (e.g. BHD,
 * KWD) is out of scope for invoice creation, not silently truncated.
 * OrganizationProfile's own broader currency support is untouched by this
 * module.
 */

const REFERENCE_LOCALE = "en-US";

function resolvesToTwoDecimalPlaces(currency: string): boolean {
  try {
    const options = new Intl.NumberFormat(REFERENCE_LOCALE, { style: "currency", currency }).resolvedOptions();
    return options.minimumFractionDigits === 2 && options.maximumFractionDigits === 2;
  } catch {
    // Intl throws a RangeError for a syntactically invalid currency code
    // (not merely an unusual one) — never a currency this app should
    // consider supported.
    return false;
  }
}

// Built from Intl.supportedValuesOf("currency") — the same real-platform-API
// technique already proven in src/lib/validation/company-profile.ts:31 —
// filtered down to exactly the two-decimal-place subset (§6). Computed once
// at module load; Intl's own currency table doesn't change at runtime.
const SUPPORTED_INVOICE_CURRENCIES: ReadonlySet<string> = new Set(
  Intl.supportedValuesOf("currency").filter(resolvesToTwoDecimalPlaces),
);

/** Uppercase-normalizes and checks membership in the bounded two-decimal-place set — never "any 3 uppercase letters." */
export function isSupportedInvoiceCurrency(value: string): boolean {
  return SUPPORTED_INVOICE_CURRENCIES.has(value.trim().toUpperCase());
}

/** Every supported invoice currency code, sorted ascending — a stable order for rendering a `<select>`. */
export function getSupportedInvoiceCurrencies(): readonly string[] {
  return Array.from(SUPPORTED_INVOICE_CURRENCIES).sort();
}

export type InvoiceCurrencyDefault = {
  /** The currency a new invoice's form should default to. */
  currency: string;
  /** True when `organizationCurrency` was missing/unsupported and `currency` fell back to USD instead. */
  isFallback: boolean;
  /** The organization's own currency as read, uppercase-normalized — null if absent/blank. Present even when it caused a fallback, so the UI can say what was rejected. */
  organizationCurrency: string | null;
};

/**
 * Resolves the default currency for a new invoice form (§6): the
 * organization's own currency when it's in the supported two-decimal set,
 * else an explicit USD fallback — never a silent substitution the caller
 * can't detect and disclose.
 */
export function resolveInvoiceCurrencyDefault(organizationCurrency: string | null | undefined): InvoiceCurrencyDefault {
  const normalized = organizationCurrency?.trim().toUpperCase() || null;

  if (normalized && isSupportedInvoiceCurrency(normalized)) {
    return { currency: normalized, isFallback: false, organizationCurrency: normalized };
  }

  return { currency: "USD", isFallback: true, organizationCurrency: normalized };
}

/**
 * Formats a monetary amount for a supported invoice currency. Validates
 * the currency (and that `amount` is finite) BEFORE ever calling
 * `Intl.NumberFormat` — never throws for rejected input, returns `null`
 * instead, so a caller can't accidentally crash a render path on a bad
 * currency/amount.
 */
export function formatInvoiceCurrencyAmount(
  amount: number | string,
  currency: string,
  locale: string = REFERENCE_LOCALE,
): string | null {
  if (!isSupportedInvoiceCurrency(currency)) return null;

  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return null;

  return new Intl.NumberFormat(locale, { style: "currency", currency: currency.trim().toUpperCase() }).format(numeric);
}
