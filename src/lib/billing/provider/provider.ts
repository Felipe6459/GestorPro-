import "server-only";
import { TEST_MODE } from "@/lib/test-mode";
import type { BillingProviderAdapter } from "./types";
import { createMockBillingProvider } from "./mock-provider";
import { createUnconfiguredBillingProvider } from "./unconfigured-provider";

/**
 * Billing & Subscriptions Stage 4 (this stage's own §3). The single
 * resolver every checkout/portal action and the webhook route calls —
 * never construct an adapter any other way.
 *
 * Behavior:
 *   - TEST_MODE on → MockBillingProvider (deterministic, no network calls).
 *   - otherwise → UnconfiguredBillingProvider (fails closed).
 *
 * A real provider (Paddle/Stripe) is Stage 5+'s addition: a third branch
 * here, gated on a real `BILLING_PROVIDER`/`BILLING_API_KEY` env var this
 * stage deliberately does not read (see .env.example's own placeholder
 * comments) — importing this module must never throw or fail at import
 * time in a production deployment with no billing env vars configured at
 * all, which is exactly what today's two-branch behavior already
 * guarantees.
 */
export function getBillingProviderAdapter(): BillingProviderAdapter {
  if (TEST_MODE) {
    return createMockBillingProvider();
  }
  return createUnconfiguredBillingProvider();
}
