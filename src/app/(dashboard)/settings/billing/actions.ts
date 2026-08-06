"use server";

import { Role } from "@/generated/prisma/enums";
import { getCurrentMembership } from "@/lib/current-user";
import { isPurchasablePlanKey } from "@/lib/billing/plan-selection";
import { getBillingProviderAvailability } from "@/lib/billing/provider-availability";

/**
 * Billing & Subscriptions Stage 3 (this stage's own §8). Provider-neutral
 * placeholder actions — no Paddle/Stripe SDK, no checkout/customer-portal
 * URL, no Subscription/WebhookEvent write, no Activity/Notification row.
 *
 * Chosen UX (the task explicitly asks for one option, justified): real,
 * enabled, OWNER-only Server Actions that actually execute the full
 * authorization/validation path and return a controlled "not configured"
 * result — not disabled buttons with static explanatory text. Reasoning:
 * (1) it demonstrates the entire intended flow end-to-end (role check →
 * plan validation → provider check → response) the same way it will work
 * once Stage 4 connects a real provider, which is what "sale-ready"
 * actually means here — a disabled button demonstrates nothing; (2) the
 * one thing Stage 4 needs to change to go live is the body of
 * getBillingProviderAvailability() plus what happens after its `configured`
 * check — every other line in these two actions (role resolution, plan
 * allowlisting) is already exactly what a real implementation needs, so
 * nothing here is throwaway Stage 3-only scaffolding. Non-owners still see
 * enabled plan cards/manage button in the UI (this stage's own §3 chose
 * "disabled with explanation," not "hidden," for the *button*) but these
 * actions independently re-check role server-side regardless of what the
 * client renders — the server is never relying on the button being
 * disabled for its own authorization decision.
 *
 * No rate limiting: these actions have zero side effects (no write, no
 * email, no external call) — nothing here is worth abuse-limiting, and
 * this codebase's existing rate limits all guard actions that mutate state
 * or send email.
 */

export type BillingActionResult = { ok: true; message: string } | { ok: false; message: string };

const NOT_OWNER_MESSAGE = "Only the organization owner can manage billing.";
const INVALID_PLAN_MESSAGE = "That plan isn't available.";
const NOT_CONFIGURED_MESSAGE = "Billing provider is not configured.";

/** planKey is client input — always validated against the compile-time catalog and its billingAvailable flag, never trusted. organizationId/role are never accepted as parameters; they are always resolved server-side via getCurrentMembership(). */
export async function requestPlanChangeAction(planKey: string): Promise<BillingActionResult> {
  const { membership } = await getCurrentMembership();

  if (membership.role !== Role.OWNER) {
    return { ok: false, message: NOT_OWNER_MESSAGE };
  }

  if (!isPurchasablePlanKey(planKey)) {
    return { ok: false, message: INVALID_PLAN_MESSAGE };
  }

  const availability = await getBillingProviderAvailability();
  if (!availability.configured) {
    return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  }

  // Unreachable in Stage 3 (getBillingProviderAvailability() always reports
  // configured: false) — kept as the single, obvious insertion point for
  // Stage 4's real checkout-session creation, so that work is an addition
  // here, not a rewrite of the authorization/validation above it.
  return { ok: false, message: NOT_CONFIGURED_MESSAGE };
}

/** No parameters at all — the subscription being managed is always the caller's own active organization's, resolved server-side. */
export async function manageSubscriptionAction(): Promise<BillingActionResult> {
  const { membership } = await getCurrentMembership();

  if (membership.role !== Role.OWNER) {
    return { ok: false, message: NOT_OWNER_MESSAGE };
  }

  const availability = await getBillingProviderAvailability();
  if (!availability.configured) {
    return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  }

  // Unreachable in Stage 3 — Stage 4's real customer-portal redirect goes here.
  return { ok: false, message: NOT_CONFIGURED_MESSAGE };
}
