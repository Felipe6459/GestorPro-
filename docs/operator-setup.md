# Operator Setup

Notes for whoever eventually operates a real deployment of this project —
what's already built, what still needs connecting, and what's deliberately
left undone. Currently covers **Billing only**; other sections will be
added here as they become relevant.

No real credentials, keys, or account-specific values are included
anywhere in this document. Every value below is a placeholder to fill in
from your own provider account.

## Billing

See [`docs/billing-architecture.md`](billing-architecture.md) for the full
design. This section is the practical "what do I still need to do"
checklist for an operator, not a repeat of that design document.

### What's already implemented

- A local, provider-neutral `Subscription`/`WebhookEvent` schema, a typed
  plan catalog (`src/lib/billing/plans.ts`), organization entitlements
  (`src/lib/billing/entitlements.ts`), and server-side limit enforcement on
  staff invites, Client/Project creation, and Attachment uploads.
- A staff-only Billing page (`/settings/billing`) showing current plan,
  status, usage, and Starter/Pro plan cards — all sourced from the local
  database, never from a payment provider (there isn't one connected).
- Placeholder "Upgrade"/"Downgrade"/"Manage subscription" actions that run
  the full authorization/validation path (owner-only, plan-key allowlist)
  and return a controlled "Billing provider is not configured." result.
  They have **zero side effects** — no Subscription row is written, no
  webhook event is created, no email is sent.
- Every organization created so far — including ones created before
  billing existed — resolves to a safe access mode (`FULL_ACCESS` for a
  pre-billing/legacy org, a real trial/paid state for a new one). Nothing
  in the current code degrades an existing organization's access.

### What's still pending — connecting a real payment provider

None of the following exists yet. Building them is future work, not a
configuration flag to flip:

1. **Provider account and mode selection.** The architecture doc
   recommends Paddle (Merchant of Record) over Stripe, but this is flagged
   there as an *unverified, pre-implementation* recommendation — confirm
   product/country eligibility and review with an accountant before
   committing (see `docs/billing-architecture.md` §2/§16).
2. **A provider adapter.** No Paddle/Stripe SDK is installed. This needs a
   thin, provider-specific module implementing the same interface
   `getBillingProviderAvailability()` currently stubs out
   (`src/lib/billing/provider-availability.ts`) — swap that one function's
   body for a real config check, and the rest of the Billing UI needs no
   changes.
3. **Checkout route.** No `/api/billing/checkout` (or equivalent) route
   exists. `requestPlanChangeAction` (`src/app/(dashboard)/settings/billing/actions.ts`)
   has exactly one clearly-marked insertion point for creating a real
   checkout session once a provider is connected.
4. **Webhook route.** No webhook endpoint exists yet. The `WebhookEvent`
   table (idempotency key, processing status, attempt count — no raw
   payload column, by design) is ready to receive events once a route is
   built to write to it and process them.
5. **Customer portal / subscription management.** No redirect to a
   provider-hosted billing portal exists yet. `manageSubscriptionAction`
   has the equivalent single insertion point for that redirect.
6. **Real price IDs.** No price/product IDs are hardcoded anywhere in this
   codebase. They must come from environment variables added at the time a
   provider is actually connected — never committed to source.
7. **New environment variables.** None have been added for billing yet.
   When they are, they must never use a `NEXT_PUBLIC_` prefix unless the
   value is genuinely safe to expose to the browser (a publishable
   checkout key may qualify; a secret/API key never does) — see
   `scripts/security-checks/check-billing-security.mjs`, which already
   guards against a `NEXT_PUBLIC_*` billing/provider variable being
   introduced by mistake.

### Migration and backfill

- The billing schema migration (`prisma/migrations/20260830090000_add_billing_foundation/`)
  has **not** been applied to any shared or production database as part of
  this work — it was generated and verified only against a disposable
  local test database. Review it and apply it deliberately, the same as
  any other migration, before this code is deployed anywhere it matters.
- `prisma/backfill-subscriptions.ts` (idempotent, dry-run by default) gives
  every pre-existing organization an explicit `LEGACY` Subscription row
  instead of relying indefinitely on the "no row = legacy access" fallback.
  It has **not** been run against any shared or production database. Run
  it (dry-run first) only when you're ready to make that state explicit.

### Live payments

Live billing is disabled by construction — there is no code path in this
repository that can currently charge a real customer. It stays that way
until all of the above is built and deliberately turned on.
