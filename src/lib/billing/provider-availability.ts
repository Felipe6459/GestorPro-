import type { BillingProvider } from "@/generated/prisma/enums";

/**
 * Billing & Subscriptions Stage 3 (docs/billing-architecture.md's Stage 3
 * note, this stage's own §9). No payment provider is connected yet — this
 * always reports `configured: false`. Deliberately reads no env var and
 * detects nothing real: Stage 3 explicitly forbids "attempt to detect a
 * real Paddle config," since there isn't one, and a function that tried
 * would just be dead code exercising nothing until Stage 4 actually wires
 * a provider adapter in.
 *
 * The one seam Stage 4 needs: every caller (the billing page's view-model
 * builder, the placeholder Server Actions) already goes through this
 * function instead of hardcoding `false` inline, so swapping this body for
 * a real provider-config check later is a one-file change, not a grep-and-
 * replace across the UI.
 */
export type BillingProviderAvailability = {
  configured: boolean;
  provider: BillingProvider;
  checkoutAvailable: boolean;
  portalAvailable: boolean;
};

export async function getBillingProviderAvailability(): Promise<BillingProviderAvailability> {
  return {
    configured: false,
    provider: "PADDLE",
    checkoutAvailable: false,
    portalAvailable: false,
  };
}
