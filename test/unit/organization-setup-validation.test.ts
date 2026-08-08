import { describe, expect, it } from "vitest";
import { parseCompanyProfileForm, getSupportedCurrencies, getSupportedTimezones } from "@/lib/validation/company-profile";
import { parsePaymentDetailsForm } from "@/lib/validation/payment-details";
import { parseDomainSettingsForm } from "@/lib/validation/domain-settings";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseCompanyProfileForm", () => {
  it("accepts a fully valid submission with no field errors", () => {
    const { values, fieldErrors } = parseCompanyProfileForm(
      formData({ legalName: "Acme Inc. LLC", displayName: "Acme", country: "United States", currency: "usd", timezone: "America/New_York" }),
    );
    expect(fieldErrors).toEqual({});
    expect(values).toEqual({
      legalName: "Acme Inc. LLC",
      displayName: "Acme",
      country: "United States",
      currency: "USD",
      timezone: "America/New_York",
    });
  });

  it("requires every field", () => {
    const { fieldErrors } = parseCompanyProfileForm(formData({}));
    expect(fieldErrors.legalName).toBeTruthy();
    expect(fieldErrors.displayName).toBeTruthy();
    expect(fieldErrors.country).toBeTruthy();
    expect(fieldErrors.currency).toBeTruthy();
    expect(fieldErrors.timezone).toBeTruthy();
  });

  it("rejects a currency code Intl doesn't recognize, case-insensitively normalizing valid ones", () => {
    const invalid = parseCompanyProfileForm(
      formData({ legalName: "A", displayName: "A", country: "A", currency: "NOTREAL", timezone: "America/New_York" }),
    );
    expect(invalid.fieldErrors.currency).toBeTruthy();

    const valid = parseCompanyProfileForm(
      formData({ legalName: "A", displayName: "A", country: "A", currency: "eur", timezone: "America/New_York" }),
    );
    expect(valid.fieldErrors.currency).toBeUndefined();
    expect(valid.values.currency).toBe("EUR");
  });

  it("rejects a time zone Intl doesn't recognize", () => {
    const { fieldErrors } = parseCompanyProfileForm(
      formData({ legalName: "A", displayName: "A", country: "A", currency: "USD", timezone: "Not/A_Real_Zone" }),
    );
    expect(fieldErrors.timezone).toBeTruthy();
  });

  it("getSupportedCurrencies/getSupportedTimezones return real, non-empty, sorted catalogs", () => {
    const currencies = getSupportedCurrencies();
    const timezones = getSupportedTimezones();
    expect(currencies.length).toBeGreaterThan(50);
    expect(currencies).toContain("USD");
    expect(currencies).toEqual([...currencies].sort());
    expect(timezones.length).toBeGreaterThan(50);
    expect(timezones).toContain("America/New_York");
    expect(timezones).toEqual([...timezones].sort());
  });
});

describe("parsePaymentDetailsForm", () => {
  it("accepts a fully valid submission, with optional paymentInstructions", () => {
    const { values, fieldErrors } = parsePaymentDetailsForm(
      formData({ bankName: "First Bank", accountHolder: "Acme Inc.", accountNumber: "GB29NWBK60161331926819", swiftBic: "NWBKGB2L" }),
    );
    expect(fieldErrors).toEqual({});
    expect(values.paymentInstructions).toBeNull();
  });

  it("requires bankName/accountHolder/accountNumber/swiftBic, but not paymentInstructions", () => {
    const { fieldErrors } = parsePaymentDetailsForm(formData({}));
    expect(fieldErrors.bankName).toBeTruthy();
    expect(fieldErrors.accountHolder).toBeTruthy();
    expect(fieldErrors.accountNumber).toBeTruthy();
    expect(fieldErrors.swiftBic).toBeTruthy();
    expect(fieldErrors.paymentInstructions).toBeUndefined();
  });

  it("preserves a provided paymentInstructions value", () => {
    const { values } = parsePaymentDetailsForm(
      formData({
        bankName: "First Bank",
        accountHolder: "Acme Inc.",
        accountNumber: "123456",
        swiftBic: "NWBKGB2L",
        paymentInstructions: "Reference invoice number in the memo.",
      }),
    );
    expect(values.paymentInstructions).toBe("Reference invoice number in the memo.");
  });
});

describe("parseDomainSettingsForm", () => {
  it("an empty customDomain is valid (means: use the generated subdomain only)", () => {
    const { values, fieldErrors } = parseDomainSettingsForm(formData({}));
    expect(fieldErrors.customDomain).toBeUndefined();
    expect(values.customDomain).toBeNull();
  });

  it("accepts a well-formed domain, lowercased", () => {
    const { values, fieldErrors } = parseDomainSettingsForm(formData({ customDomain: "Custom-Domain.COM" }));
    expect(fieldErrors.customDomain).toBeUndefined();
    expect(values.customDomain).toBe("custom-domain.com");
  });

  it("rejects an obviously malformed domain", () => {
    for (const bad of ["not a domain", "http://example.com", "-leading-dash.com", "no-dot"]) {
      const { fieldErrors } = parseDomainSettingsForm(formData({ customDomain: bad }));
      expect(fieldErrors.customDomain, `expected "${bad}" to be rejected`).toBeTruthy();
    }
  });
});
