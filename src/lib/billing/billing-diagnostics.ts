import "server-only";

/**
 * Production Observability Correction 2 — bounded, non-disclosing
 * diagnostics for genuine external Paddle/billing provider-call
 * failures. Reuses the same audited principle Stability Correction F5
 * and PR #111 (src/lib/client-portal/analytics-events.ts,
 * src/lib/invoices/pdf/issue-diagnostics.ts) already established: a
 * fixed, stable event key plus one allowlisted enum field only — never
 * the caught error, never any identifier, never message/stack/cause/
 * digest/provider response/payload, never an organization/customer/
 * subscription/price/user id, email, checkout/customer-portal URL,
 * request header/cookie/IP/query string, or environment value.
 *
 * Deliberately kept outside src/lib/billing/provider/ (the directory
 * scripts/security-checks/check-billing-security.mjs's own check #15
 * already bans all console logging from, to keep a raw provider
 * payload/secret from ever reaching a log line even by accident) — this
 * module lives one level up, called only from the two Server Actions
 * that catch a genuine adapter throw
 * (src/app/(dashboard)/settings/billing/actions.ts), never from the
 * adapter itself. No error/unknown parameter exists on the function
 * below at all, so nothing beyond a value from the closed
 * `BillingProviderOperation` union can ever reach this log line,
 * regardless of what the provider actually threw.
 */

const PROVIDER_FAILURE_EVENT = "[billing] Provider session creation failed.";

/** Which of the two genuine external provider calls failed — never which organization/customer/subscription. */
export type BillingProviderOperation = "checkout" | "customer_portal";

export function logBillingProviderFailure(operation: BillingProviderOperation): void {
  console.error(PROVIDER_FAILURE_EVENT, { operation });
}
