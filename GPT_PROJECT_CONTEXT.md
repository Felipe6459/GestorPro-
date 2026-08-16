# GPT_PROJECT_CONTEXT.md — Client Portal CRM

**Purpose of this document:** a self-contained handoff so a new AI conversation (with no memory of prior development) can understand what has already been built in this repository, without re-deriving it from scratch or assuming it needs to be rebuilt.

**Investigated at:** `main` @ commit `d76cd51c54594ae0f5743b1918fbae60ac8c1126` (147 commits, 2026-07-28 → 2026-08-14, tracked working tree clean) — this is the commit the full-repository investigation below (Parts 1–26) was performed against, verified directly against source code, Prisma schema, migrations, git history, and live check runs (lint/typecheck/build/tests) at that time. This remains a historical baseline, preserved for provenance — it is **not** the current application-state baseline (see below).

**Current application-state baseline:** `main` @ commit `34118012422f4434d6a183d6ca83f1a05c555101` (170 commits at content-update time; tracked working tree clean before this documentation task began). Eight application/documentation changes have landed on `main` since the original investigation:
- **PR #58** (merged as `91234ade4cd5f9bc6cf28531e4355640a492ea56`) — resolved the disposition of two previously-stale branches; one line changed in one E2E test file, no application code/schema/behavior change. See Part 2's Phase 21 and Part 24.
- **PR #59** (merged as `217dbda8734eb1bf96c505d57639dbb851837df8`) — added this file, `GPT_PROJECT_CONTEXT.md`, to the repository under version control. Documentation-only, no application-code change.
- **PR #60** (merged as `f1b4dc61d066d6a126fb4511bca0720db6637ea8`) — completed **Portal Analytics persistence** (Slice 1): `PortalUser.lastLoginAt`, the new `PortalDownloadRequest` model, and the write paths that populate them. See Part 2's new Phase 22.
- **PR #61** (merged as `a5049cba63cd906069f8c10ab4a2f30a3a47015b`) — completed **Portal Analytics read path** (Slice 2): the two new `PortalMetrics` fields, the `getPortalEngagementCounts()` query, the two scalar UI cards, and the corrected Portal empty-state predicate. See Part 2's new Phase 22.
- **PR #62** (merged as `e92e03586e9f87f02225d7520a46f06fd6ad996e`) — **documentation-only.** A prior refresh of this file after PR #61. No application-state change — this is exactly the same kind of commit as the one that produced this current revision of the document.
- **PR #63** (merged as `41452bd7391700f1b73063b4a8e16864d0e3de84`) — **application change.** Repaired the pre-existing `Invoice.organizationId` persistence/scoping defect: every existing Invoice row was deterministically resolved through Project/Client organization consistency (migration `20260911090000_repair_invoice_organization_scope`), `Invoice.organizationId` is now a required (`NOT NULL`) column in the Prisma schema, and the real create/update Server Actions write and maintain it on every save. The Analytics query paths that read `Invoice.organizationId` directly are no longer silently undercounted by normal application-created invoices that previously omitted it. **This migration has not been applied to any external/staging/production database by this development task** — merging into source control and a real deployment are separate, deliberately un-conflated steps. See Part 2's new Invoice System phase below.
- **PR #64** (merged as `cde602d12a0c854cded300bd91e7810cb9e089ee`) — **documentation-only.** Added `docs/invoicing-architecture.md`, the approved target-design/implementation-slice document for the full Invoice System (itemization, calculation, lifecycle, snapshot, immutable PDF archive, email/idempotency, portal visibility, and safe-migration contracts, sequenced as Slices 0–5). This PR does not itself implement any of those future slices — it is the approved plan Slice 1 (PR #65) and later slices build against.
- **PR #65** (merged as `34118012422f4434d6a183d6ca83f1a05c555101`) — **application change.** Completed **Invoice System Slice 1** — the additive schema/calculation-domain/Client-billing-identity/flat-Invoice-dual-write foundation described in `docs/invoicing-architecture.md`. See Part 2's new Invoice System phase below for the full breakdown of what shipped and what remains. **PR #65 is the latest application change reflected in this document.**

This document was re-swept after PR #65 to keep every affected claim accurate — model/enum/migration/line counts, current test totals, the Invoice feature status, and Part 11's stale flat-amount-only wording are all updated below to reflect this baseline, not left as stale open items. A later, purely documentation-only commit that updates this file under version control does not by itself change the application-state baseline stated above — it remains `34118012422f4434d6a183d6ca83f1a05c555101` until a future application change lands.

`GPT_PROJECT_CONTEXT.md` is maintained in the repository as the durable AI/contributor handoff; documentation-only commits that add or update this file under version control do not by themselves change the application-state baseline it describes.

This document describes what the repository **actually contains** — not a description of what a typical CRM "should" have.

---

## PART 1 — Executive Project Summary

**Client Portal CRM** is a multi-tenant CRM SaaS application for freelancers and small agencies. Each signed-up account becomes its own **Organization** ("workspace" / tenant) with its own staff team, its own Clients/Projects/Tasks/Invoices, its own billing subscription, and — its most distinctive feature — an optional **Client Portal**: a separate, thinner login where the freelancer's *own clients* can sign in to see only their own projects and invoices.

**What it does:** lets a freelancer or small agency track clients, run projects broken into tasks, issue invoices, collaborate internally via comments/@mentions/notifications, see their business at a glance via a dashboard and analytics, manage a staff team with roles, and optionally give each client a self-service portal into their own work — all as a single coherent product, not a set of disconnected tools.

**Who it's for:** freelancers and small agencies who currently juggle a generic CRM/spreadsheet, a separate invoicing tool, and no real way to share status with clients except email.

**Major workflows already implemented:**
1. Sign up → get a personal Organization automatically → invite teammates → invite a client → track work → invoice → get paid (status tracked manually) → client sees their own portal.
2. Staff manage Clients → Projects → Tasks → Invoices, all scoped to one Organization.
3. A Client is invited to the Client Portal (separate identity) and can log in to see only their own projects/invoices.
4. An Owner/Admin manages team roles, billing plan/usage, company profile, and (for whoever operates the whole deployment) a separate Platform Admin console across all tenants.

**Overall architecture:** Next.js App Router (Server Components + Server Actions, no client-side data-fetching library), Prisma ORM against PostgreSQL (Supabase-hosted), Supabase Auth for both staff and portal identities, Supabase Storage for files, Tailwind CSS for styling, deployed to Vercel. No REST/GraphQL API layer for the app's own UI — pages read data directly via Prisma in Server Components, and all mutations go through Server Actions. A handful of real Route Handlers exist only where a Server Action can't work (Paddle webhook, file downloads, cron jobs, search-as-you-type, auth email-confirmation callback).

**Maturity assessment (evidence-based, detailed in Part 26):** this is a **functional, feature-complete MVP-to-early-SaaS-grade product**, not a prototype and not yet a fully hardened production SaaS with paying customers. It has real multi-tenant data isolation, a real (but not live-validated) payment integration, 2,044 automated tests, 14 dedicated security checks, and a clean lint/typecheck/build — but it has never processed a real transaction, never had a real customer, and carries a short, explicitly disclosed list of known gaps (custom-domain verification, itemized invoice UI/lifecycle/PDF export/email delivery, cross-instance rate limiting, billing reconciliation).

---

## PART 2 — Development History (reconstructed from git log; 147 commits as of the original investigation, 2026-07-28 → 2026-08-14; 170 commits as of this update)

Development happened in tight, sequential, PR-per-feature phases — every feature branch was fully merged into `main` (verified: `git rev-list --count main..<branch>` = 0 for every branch that currently exists). Two branches briefly sat unmerged at the time of the original investigation (`git rev-list --count main..<branch>` = 2 and 1, respectively) — both have since been triaged and deleted via Phase 21/PR #58, see Part 24. The phase names below are reconstructed directly from actual commit messages and PR titles, not invented.

### Phase 0 — Bootstrap (2026-07-28 – 2026-07-29)
`6c2ac59` Initial commit from Create Next App → `90309e0` **"Initial release: Client Portal CRM v1"**. This single large commit already contained the foundational single-tenant CRM: Clients, Projects, Tasks, Invoices, a Dashboard, and Supabase-based staff authentication, all scoped by a plain `userId` (no multi-tenancy yet). Followed by small fixes (Prisma-generate-on-install, dark-mode input contrast) and early README/screenshot work. **Still exists today**, evolved into the current schema.

### Phase 1 — Multi-tenant retrofit (2026-07-31, PR #1 `feature/multi-tenant`)
Added `Organization`/`Membership`/`Invitation` models, an idempotent backfill script, then **re-scoped every existing business model** (Client, Project, Task, Invoice) from `userId`-only to `organizationId` (via each entity's own relation chain). Added active-organization resolution via an httpOnly cookie, the Team page (members, pending invitations, invite/resend/cancel), role management, member removal/leave, an organization switcher for multi-membership users, and real invitation emails via Resend. **This is the single most important architectural change in the project's history** — everything after this phase assumes a multi-tenant data model. Still exists today, unchanged in its core design.

### Phase 2 — Activity Timeline (2026-08-01, PR #2)
Added an append-only `Activity` audit-log model, wired logging into every Client/Project/Task/Invoice/Team mutation, and built the `/activity` timeline UI. Still exists.

### Phase 3 — File Attachments (2026-08-01, PR #3–#5)
Added the `Attachment` model, a Supabase Storage admin client and file helpers, upload/download/delete for Client/Project/Invoice, Activity-timeline formatting for attachment events, and cleanup of attachments when a parent entity is deleted. Still exists.

### Phase 4 — Dashboard Analytics query layer (2026-08-02, PR #6)
Wired up `Invoice.paidAt` lifecycle tracking and added a real dashboard analytics query layer (KPIs, revenue). Later superseded/expanded by the dedicated Analytics feature (Phase 13). Still exists as the Dashboard's own query layer.

### Phase 5 — Client Portal (2026-08-02, PR #7)
Added `PortalUser`/`ClientInvitation` schema (a deliberately separate identity model from staff `User`), the Client Portal auth foundation and `/portal` route with an identity guard, the full invitation flow (staff-side UI, accept flow, portal signup), and read-only Portal Projects/Invoices/Profile/navigation plus read-only Portal Attachments. **This is the feature that differentiates the product** — still exists, and is the same structural design used today.

### Phase 6 — Security hardening round 1 (2026-08-02–08-03, PR #8–#11)
Revoked anon/authenticated privileges on all public-schema Postgres tables (so Supabase's auto-generated Data API can never bypass the app's own authorization — see Part 19), hardened the Supabase Auth session cookie flags, added centralized rate limiting across auth/invitation/attachment endpoints, and added production-grade HTTP security headers. Still exists.

### Phase 7 — Test/CI infrastructure (2026-08-03, PR #12, "Stage 2–6")
Built the test infrastructure from scratch: a security-regression skeleton, unit tests for pure-function helpers, integration tests against a real Prisma + real Server Actions (backed by an in-process PGlite Postgres), a full Playwright E2E suite (staff app, org isolation, portal, invitations, attachments, activity, security UI), and a CI audit/hardening/docs pass. This is the foundation the project's current 2,044-test suite grew from. Still exists and has been continuously extended by every subsequent phase.

### Phase 8 — Notifications Center (2026-08-03–08-04, PR #13, "Stage 8")
Added the `Notification`/`NotificationDelivery`/`NotificationPreference` models, a fan-out mechanism from Activity through a single choke point, the Notifications Center UI (bell, unread badge, dropdown) and a full `/notifications` inbox, best-effort email delivery, per-user channel preferences, and background jobs for delivery retry / cleanup / digest foundation. Still exists.

### Phase 9 — Comments & Mentions (2026-08-04, PR #14)
Added the `Comment`/`CommentMention` models, mention-parsing backend wired into Activity/Notification, and the Comments UI on Projects and Tasks. Still exists.

### Phase 10 — Global Search (2026-08-04–08-06, PR #15)
An architecture doc, backend search infrastructure across Clients/Projects/Tasks/Invoices/Comments, the staff header search UI, then two audit-driven hardening passes (ARIA state, org-switch safety, request-race handling, keyboard-shortcut guard). Still exists.

### Phase 11 — Billing & Subscriptions foundation (2026-08-06–08-07, PR #17)
Architecture doc, the `Subscription`/`WebhookEvent` schema, a typed plan catalog (`Trial`/`Starter`/`Pro`/`Legacy`), entitlement/enforcement logic, a Billing settings UI (provider-neutral, no live payments yet), and a provider-neutral integration shell (adapter interface + mock provider + webhook route skeleton). **Real Paddle wiring came much later**, in Phase 19. Still exists as the foundation Phase 19 built on top of.

### Phase 12 — Onboarding (2026-08-07, PR #16)
Architecture doc, the `OrganizationOnboardingStep` schema plus a live-computed progress engine, the Dashboard onboarding checklist UI, a Client Portal welcome banner, then two audit-driven polish/accessibility passes (focus indicators, contrast). Still exists.

### Phase 13 — Analytics (2026-08-07–08-08, PR #18–#23)
A provider-neutral foundation layer, a complete metrics UI, chart/trend visualizations (Recharts), and Portal-specific analytics (the commit message itself flags this stage as **"partial — 2 metrics require new persistence"** at the time — **resolved later by Phase 22/PR #60–#61, see below and Part 24 for the current status**). Followed by mobile-header and tablet-breakpoint overflow fixes, regression coverage after the layout changes, and README documentation. Still exists.

### Phase 14 — SaaS Signup / Customer Setup Wizard (2026-08-08, "Stage 6.1"/6.2)
A public self-serve signup foundation and a customer setup wizard (Company Profile, Payment Receiving Details, Domain Settings steps), plus a Server Action auth-session-resolution stabilization fix. Still exists.

### Phase 15 — Workspace polish + Business Identity (2026-08-09, PR #27–#33)
Onboarding checklist workspace-completion summary, better empty states for a fresh workspace, `OrganizationProfile` extended with Business Identity fields (logo, brand color, support email, website, phone, tax ID, postal address), a full write path, and the Company Profile page transformed into a "Business Identity" configuration page with logo upload. Still exists.

### Phase 16 — Sale-Ready Phase B: Auth/Legal (2026-08-09, PR #34–#35)
Password recovery for both staff and portal users, and a Legal Foundation (Privacy Policy, Terms of Service, consent surfacing). Still exists.

### Phase 17 — Sale-Ready Phase C: Platform Admin (2026-08-09–08-10, PR #36–#40)
A read-only, env-var-gated Platform Admin console for whoever *operates* the deployment (not a tenant concern): auth guard + route group + shell, a cross-tenant Platform Dashboard (KPIs, registration timeline), and an Organization Explorer (query/service layer, list UI, detail page). Still exists.

### Phase 18 — Sale-Ready Phase D: Platform Configuration (2026-08-10, PR #41–#46)
A read-only Platform Configuration surface built section by section: foundation + legal, Branding, Email Configuration, Billing Configuration, Domain Configuration, and Deployment + Environment Information. Still exists.

### Phase 19 — Sale-Ready Phase E: real Paddle billing (2026-08-11–08-13, PR #47–#55)
This is where Billing went from "provider-neutral shell" (Phase 11) to a real, working Paddle integration: provider configuration foundation, checkout + Customer Portal core, webhook signature verification + event normalization, the hosted-checkout UX bridge, and finally provider-resolver activation (the real adapter turns on automatically once a complete Paddle config is present). Closed out with a documentation-accuracy pass and making integration-test failures actually fail CI. Still exists and is the current billing implementation.

### Phase 20 — Sale-readiness / demo & buyer packaging (2026-08-14, PR #56–#57, and this session)
S1.1 "demo experience polish" (real seeded demo Organization with two staff members and a connected portal client, branded auth pages) — merged. S1.2 buyer-facing screenshot capture and a video-script/listing draft (not committed). S1.2.1 committed the final 14-screenshot package and restructured the README gallery (PR #57, merged). This is documentation/packaging work, not application functionality — it did not change any feature behavior.

### Phase 21 — Stale branch resolution (2026-08-15, PR #58)
A small, deliberately narrow housekeeping/test-quality PR, **not a product or feature phase**. Two branches had sat unmerged since 2026-08-08/09 (`fix/stage-6-2-1-auth-refresh-race`, `test/stage-6-2-2-e2e-selector-hardening`); both were investigated in depth (source-level inspection of the exact installed `@supabase/ssr@0.12.4` dependency, plus live, non-mocked test runs in isolated worktrees) before any decision was made — see Part 24 for the resulting disposition of each. The one and only change PR #58 actually merged into `main`: `test/e2e/staff-app.spec.ts`'s sign-out test now uses a direct `page.getByRole("button", { name: "Sign out", exact: true })` instead of a previously-unnecessary form-scoped double locator — one line, one file. No application code, schema, dependency, or auth runtime behavior changed. Both investigated branches were deleted (locally and on `origin`) immediately after PR #58 merged, since their disposition — one redundant, one only partially adopted — was final.

### Phase 22 — Portal Analytics completion (2026-08-15, PR #60–#61)
Two-slice completion of the "2 metrics require new persistence" gap Phase 13 (2026-08-07/08) flagged at the time.

**Slice 1 — persistence and write paths (PR #60, merged as `f1b4dc61d066d6a126fb4511bca0720db6637ea8`).** Added `PortalUser.lastLoginAt` (nullable `DateTime`) and a new `PortalDownloadRequest` model (`id`, `organizationId`, `organization` relation, `requestedAt`) via migration `20260910090000_add_portal_analytics_persistence`. `PortalDownloadRequest` is deliberately organization-only — no `portalUserId`, `attachmentId`, `clientId`, email/name, signed URL, storage path, IP, User-Agent, session/auth data, or payload/metadata of any kind; it is structurally incapable of answering "who downloaded what." `lastLoginAt` is written only by a successful, credential-backed `/portal/login` sign-in and by a genuine first `PENDING -> ACCEPTED` invitation acceptance — never by session-cookie resolution or a bare signup with no invitation accepted. A `PortalDownloadRequest` row is written only after a portal attachment download request has already passed authorization and successfully received a signed URL. Both writes go through `src/lib/client-portal/analytics-events.ts` (`recordPortalLogin()`/`recordPortalDownloadRequest()`), are best-effort (try/catch, a fixed sanitized log string, never a caught error/identifier), and never block the real login/download behavior they're attached to. `scripts/security-checks/check-analytics-security.mjs` check #13 was rewritten from a blanket "no tracking persistence" prohibition into an exact allowlist of exactly these two approved additions' field sets, so any third, unreviewed persistence addition still fails CI.

**Slice 2 — read path and UI (PR #61, merged as `a5049cba63cd906069f8c10ab4a2f30a3a47015b`).** Added `PortalMetrics.recentlyActivePortalUsers` and `PortalMetrics.documentDownloadRequests`, and the query function `getPortalEngagementCounts()` (`src/lib/analytics/queries/portal-metrics.ts`) that computes both via two concurrent `count` queries filtered with this domain's half-open `[start, end)` convention (`gte` on the inclusive start, `lt` on the exclusive end, `gte` omitted entirely when `start` is null). The service layer (`analytics-service.ts`) passes a dedicated, literal `selectedBounds = getTimeRangeBounds(timeRange, now)` for these two fields, kept separate from the growth-comparison `growthBounds` — selecting "All time" means a true `bounds.start === null` (every row ever written), never a silent 30-day growth-fallback substitution. Both fields render as two new plain `AnalyticsGrid` cards, labeled exactly **"Recently active portal users"** and **"Download-link requests"** — deliberately plain scalars, not `GrowthMetric`s: no previous-period comparison, no `GrowthIndicator`, no `Sparkline`, no chart. The Portal section's empty-state predicate (`isPortalEmpty`) was corrected to also require both new fields to be zero — `PortalDownloadRequest` belongs directly to `Organization` (survives a `Client`'s deletion), so an organization with zero current Clients/PortalUsers but real historical download-link data now correctly still shows its Portal overview grid instead of "No activity yet."

Both slices shipped with dedicated integration and E2E coverage for the new behavior — no dedicated unit tests were added, since the write/read logic is exercised through real Prisma/Server Action integration tests and browser-level E2E rather than isolated pure functions — with the full, unchanged unit regression suite also passing alongside them. Slice 1 additionally updated `check-analytics-security.mjs` check #13 (see Part 2's Phase 22 write-up above). See `docs/analytics-architecture.md` §12.2a (Slice 1) / §12.2b (Slice 2) for the complete design writeup, and Part 24 below for the resulting bug-tracker resolution.

### Phase 23 — Invoice System: organization-scope repair, approved architecture, and Slice 1 foundation (2026-08-15–08-16, PR #63–#65)

**This is a partially-complete, multi-slice feature in progress — not a finished Invoice System.** Only the prerequisite repair and the first of five planned slices have shipped; the itemized-invoice UI, lifecycle enforcement, PDF archive, and email delivery a reader might expect from "Invoice System" work do **not** exist yet. See Part 11 for the precise current-vs-target distinction and Part 28 for exactly what's left.

**Prerequisite — `Invoice.organizationId` repair (PR #63, merged as `41452bd7391700f1b73063b4a8e16864d0e3de84`).** Fixed a pre-existing defect where production Invoice create/update never wrote `Invoice.organizationId`, leaving it permanently `NULL` for every real (non-seeded) invoice — which silently undercounted three Analytics query paths that read the column directly. Migration `20260911090000_repair_invoice_organization_scope` deterministically backfills every existing row's `organizationId` from its `Project.organizationId` (guarded: aborts loudly, never guesses, if any row's Project/Client relations disagree), then makes the column `NOT NULL` with an `ON DELETE RESTRICT` foreign key (previously nullable/`SetNull`). Every real create/update Server Action now writes `organizationId`, re-derived from the already-verified `Project` on every write, never trusted from form input. `Invoice.organizationId` is now the primary tenant-scoping predicate everywhere Invoice is queried, with `project.organizationId` retained as defense-in-depth. **This migration has not been applied to any external/staging/production database by this development task** — a real deployment remains a separate, controlled operator step.

**Slice 0 — approved architecture (PR #64, merged as `cde602d12a0c854cded300bd91e7810cb9e089ee`).** Documentation-only. Added `docs/invoicing-architecture.md`, a ~1,400-line target-design document covering: the final lifecycle contract (DRAFT → SENT/"Issued" → PAID/OVERDUE/CANCELLED, with an explicit transition matrix); the itemized data model (`InvoiceLineItem`, discount/tax fields, `InvoiceEmailAttempt`); the Decimal calculation contract; the currency contract; the snapshot contract (frozen issuer/recipient data at finalization); immutable PDF archival (store-the-rendered-file, not regenerate-on-demand); email architecture and idempotency; corrected portal DRAFT-visibility; a safe expand → backfill → contract migration strategy; and five dependency-ordered implementation slices (Slice 1 schema/calculation foundation → Slice 2 itemized UI/lifecycle → Slice 3 PDF/Issue operation → Slice 4 email → Slice 5 contract migration/portal visibility/closure). This PR implements none of that target design itself — it is the approved plan every later slice, starting with Slice 1 below, builds against.

**Slice 1 — schema/calculation/Client-billing/flat-dual-write foundation (PR #65, merged as `34118012422f4434d6a183d6ca83f1a05c555101`, PR head validated by CI at `78f09ae20d583ff60aa8447db0db0e59cc9bd60c`).** An additive **expand**-only migration and the calculation/currency/Client-billing groundwork the later slices need — no user-facing Invoice behavior changed. What shipped:
- New enums `InvoiceDiscountType` (`NONE`/`PERCENTAGE`/`FIXED`), `InvoiceTaxLabel` (`TAX`/`VAT`/`GST`), `InvoiceEmailAttemptStatus` (`PENDING`/`ACCEPTED`/`FAILED`/`UNKNOWN`).
- New models `InvoiceLineItem` and `InvoiceEmailAttempt` — both **schema-reserved only**: no Server Action, route, or UI writes either one yet.
- `Invoice` gained `internalNotes`, discount/tax fields (`discountType`/`discountValue`/`taxRatePercent`/`taxLabel`), calculated-total fields (`subtotal`/`discountAmount`/`taxAmount`), and finalization/archive fields (`finalizedAt`/`issuerSnapshot`/`recipientSnapshot`/`pdfStoragePath`/`pdfGeneratedAt`/`documentVersion`) — all additive, all either defaulted or nullable. `subtotal`/`discountAmount`/`taxAmount` are **deliberately left nullable** during this expand/dual-write phase (an old app version mid-rolling-deploy could still insert a row before the dual-write path exists everywhere); Slice 5 owns the eventual `NOT NULL` contract — this document does not describe them as a finished non-null contract.
- Migration `20260912090000_add_invoice_system_slice1_foundation` performs a deterministic, one-time legacy backfill immediately after adding the columns — `subtotal = amount`, `discountAmount = 0`, `taxAmount = 0` for every pre-existing row (COALESCE-guarded, only ever filling a currently-null value) — followed by a post-backfill verification guard (count-only `RAISE EXCEPTION` on any inconsistency), mirroring the guard/verify discipline `20260911090000` established. No synthetic `InvoiceLineItem` rows are ever created. **This migration has also not been applied to any external/staging/production database by this development task.**
- The existing flat (non-itemized) `invoices/new` and `invoices/[id]/edit` Server Actions now **dual-write** the same compatibility values on every save — `subtotal = amount`, `discountType = NONE`, `discountAmount = 0`, `taxRatePercent = null`, `taxAmount = 0`, `taxLabel = TAX` — via `buildFlatInvoiceWriteFields()`, using `Prisma.Decimal` end to end, never JS floating point. `amount` remains the value actually written and read everywhere else; every pre-existing form field, status behavior, `paidAt` four-case rule, and redirect/toast is unchanged.
- A new pure calculation domain, `src/lib/invoices/calculations.ts` — `calculateInvoiceTotals()` supports both a flat-amount source and a line-item source, applies `ROUND_HALF_UP` rounding per line before summation, validates every Decimal(10,2)/(10,3) precision and overflow boundary, and returns a typed discriminated success/error result. Not called by any Invoice UI yet — Slice 2 is its first real caller.
- A new bounded currency module, `src/lib/invoices/currencies.ts` — restricts invoice-currency support to exactly-two-decimal-place ISO currencies (rejects JPY-style zero-decimal and BHD/KWD-style three-decimal currencies), with an explicit USD-fallback indicator when an organization's own currency isn't supported. `formatInvoiceCurrencyAmount()` parses/validates every input through `Prisma.Decimal` against the same Decimal(10,2) boundary before ever calling `Intl.NumberFormat` — never a bare `Number()` conversion.
- Seven new optional `Client` billing-identity fields (`billingLegalName`, `taxId`, `streetAddress`, `city`, `state`, `postalCode`, `country`) — with a real write path: a "Billing details" subsection added to the existing `ClientForm` (create + edit), server-side max-length validation, and `null`-normalization for blank input. This is the **only** UI Slice 1 adds — no Invoice-facing UI changed. Activity logs a billing-field change as a generic `UPDATED` event listing only the **changed field names** (e.g. `"taxId"`) — never the billing value itself, matching this codebase's existing names-only Activity-diff convention.
- Dedicated unit coverage (calculation-domain, currency, Client-validation, migration-contract tests) and integration coverage (flat-invoice dual-write, Client billing-identity write path) — no new dedicated E2E test was added for the new Client billing UI (that real, browser-testable behavior is covered by the new integration tests instead), and the full existing E2E suite continued to pass, at an unchanged count of 282. Getting there required minimally disambiguating 7 existing locator call sites across 6 existing tests in 5 spec files, after the new "Billing legal name" field made a substring-matched `page.getByLabel("Name")` locator resolve to two elements — see Part 21 for the exact file/count breakdown.

**Still not implemented (Slices 2–5, unstarted):** itemized Invoice create/edit UI (no `InvoiceLineItem` writer exists anywhere in `src/app`/`src/lib`); discount/tax/currency/issue-date Invoice form controls; `DRAFT`-only creation and lifecycle-transition enforcement; a read-only "Issued" presentation; cancel-and-duplicate; the actual finalization/Issue operation and `issuerSnapshot`/`recipientSnapshot` writes; the PDF renderer, archive pipeline, and authenticated download routes; the Invoice send/resend email flow and any `InvoiceEmailAttempt` writer; the corrected portal DRAFT-visibility fix; the final `NOT NULL` contract on `subtotal`/`discountAmount`/`taxAmount`; the organization-wide `[organizationId, invoiceNumber]` uniqueness migration (today's constraint remains `[clientId, invoiceNumber]`); and the partial-unique-index backstop for "at most one `PENDING` `InvoiceEmailAttempt` per invoice." See Part 28 for the full remaining-gap list and the recommended next slice.

**Confidence note:** every phase above is directly traceable to real commit messages, PR numbers, and file changes in `git log`. Nothing in Part 2 was inferred beyond what the commit history and current code directly support.

---

## PART 3 — Current Application Architecture

**Frontend:** Next.js 16.2.12 App Router, React 19.2.4, TypeScript, Tailwind CSS 4. No client-side data-fetching library (no SWR/React Query/Apollo) — pages fetch data server-side. A small set of Client Components exist only where real interactivity is needed (forms, dropdowns, the comment mention combobox, search-as-you-type).

**Backend/server:** Server Components read data directly via Prisma. Mutations go through **Server Actions** (`"use server"` files, typically named `actions.ts` next to each route) — this is the dominant pattern throughout the app, not a REST API. A small number of real Route Handlers exist under `src/app/api/` for cases Server Actions can't cover: `POST /api/billing/webhook` (Paddle), `GET /api/attachments/[id]/download` and `GET /api/portal/attachments/[id]/download` (authenticated Route Handlers that issue a short-lived signed Supabase Storage URL and return a 307 redirect to it — they never stream/proxy file bytes through Next.js), `GET /api/search` (search-as-you-type), `GET/POST /api/cron/notification-delivery` and `/api/cron/notification-cleanup` (Vercel Cron), plus `src/app/auth/confirm/route.ts` (Supabase email-confirmation callback).

**Database:** PostgreSQL via Supabase, accessed exclusively through Prisma (`@prisma/client` 7.9.1, `@prisma/adapter-pg`). 26 models, 25 versioned SQL migrations under `prisma/migrations/` (both counts verified directly against `prisma/schema.prisma` and the migrations directory at this baseline). `DATABASE_URL` (pgbouncer pooled) is what the running app uses; `DIRECT_URL` (unpooled) is what Prisma CLI migrations use — configured in `prisma.config.ts`.

**Authentication:** Supabase Auth, for **two structurally separate identity spaces** — staff (`User`) and Client Portal contacts (`PortalUser`) — see Part 5.

**Authorization/multi-tenancy:** every business entity carries an `organizationId`; access is resolved server-side per request (never trusted from the client) via `src/lib/current-user.ts` (staff) and `src/lib/current-portal-user.ts` (portal). See Parts 5–6, 19.

**Storage:** Supabase Storage, two buckets — a private `attachments` bucket (Client/Project/Task/Invoice files, served only via authenticated download routes) and a public `logos` bucket (organization branding). `src/lib/storage/`.

**Middleware:** `middleware.ts` → `src/lib/supabase/middleware.ts` — refreshes the Supabase Auth session token on every request (skipped entirely in `TEST_MODE`, the E2E-only identity-injection bypass — see `src/lib/test-mode.ts`). This is the *only* middleware; there is no separate tenant-routing or subdomain middleware.

**Validation:** hand-rolled, not a schema library like Zod — each feature has a `src/lib/validation/*.ts` file that parses a `FormData` object into a typed, validated shape plus field-level errors (see e.g. `src/lib/validation/client.ts`). Consistent pattern across Clients/Projects/Tasks/Invoices/Invitations/Company Profile/Payment Details/Domain Settings.

**State management:** none beyond React's own — no Redux/Zustand/Context-heavy global state. Server Components + `router.refresh()`-style revalidation after Server Actions is the dominant data-flow pattern.

**Email:** Resend (`src/lib/email/`), used for staff invitations, Client Portal invitations, password reset, and notification delivery — every email path degrades gracefully (a copyable link in the UI) when `RESEND_API_KEY` is unset.

**Notifications:** in-app Notification Center + best-effort email delivery + background retry/cleanup jobs — see Part 15.

**Deployment:** Vercel (`vercel.json` configures two cron routes), Supabase for Postgres/Auth/Storage. See Part 20.

**Testing:** Vitest (unit + integration) and Playwright (E2E) — see Part 21.

**Orientation for a new contributor — key directories:**
- `src/app/(dashboard)/` — the staff application (Clients/Projects/Tasks/Invoices/Team/Settings/Analytics/Activity/Notifications), each route typically holding `page.tsx` + `actions.ts` + `query.ts`.
- `src/app/(platform-admin)/` — the operator-only cross-tenant console.
- `src/app/portal/` and `src/app/portal/(app)/` — the Client Portal's own auth pages and app shell.
- `src/app/(auth)/` — staff login/signup/forgot-password/reset-password.
- `src/app/api/` — the small set of real Route Handlers.
- `src/lib/` — all business logic, one subdirectory per feature/domain (see Part 18).
- `src/components/` — one subdirectory per feature, plus `src/components/ui/` for shared primitives.
- `prisma/schema.prisma` and `prisma/migrations/` — the data model.
- `docs/*.md` — per-feature architecture design documents (Analytics, Billing, Comments, Notifications, Onboarding, Search, the billing provider adapter contract, operator setup, testing).
- `test/unit/`, `test/integration/`, `test/e2e/` — the three-tier automated test suite.
- `scripts/security-checks/` — 14 standalone static-invariant checks (see Part 19).

---

## PART 4 — Database and Data Model

Full schema: `prisma/schema.prisma` (1,494 lines, 26 models, 22 enums, 25 migrations — all four counts verified directly at this baseline). Every business model below carries `organizationId` for tenant scoping unless noted.

| Model | Represents | Key relationships |
|---|---|---|
| `User` | A staff identity (id = Supabase `auth.users.id`) | owns Clients/Projects, assigned Tasks, has `Membership`s, authors Comments, uploads Attachments |
| `Organization` | A tenant/workspace | has `Membership`s, `Invitation`s, all business entities, one `Subscription`, one `OrganizationProfile`/`OrganizationPaymentDetails`/`OrganizationDomainSettings` |
| `Membership` | A `User`'s role (`OWNER`/`ADMIN`/`MEMBER`) within one `Organization` | unique per (user, org) |
| `Invitation` | A pending/accepted staff invite by email, token-based | belongs to one `Organization` |
| `Client` | A freelancer's own client/customer | owned by a `User`, scoped to an `Organization`, has Projects/Invoices/`PortalUser`s/`ClientInvitation`s; since Invoice System Slice 1 (PR #65) also carries seven optional billing-identity fields (`billingLegalName`, `taxId`, `streetAddress`, `city`, `state`, `postalCode`, `country`), all nullable, with a real create/edit write path — see Part 11 |
| `Project` | Work for one `Client` | has an owning `User`, a `Client`, Tasks, Invoices |
| `Task` | A unit of work within a `Project` | optional assignee `User` |
| `Invoice` | A billing document for a `Client`/`Project` | status lifecycle (Draft/Sent/Paid/Overdue/Cancelled), `paidAt`; `organizationId` is a required, `NOT NULL` tenant-scoping column as of PR #63 (previously nullable, silently unwritten by production code); since Slice 1 (PR #65) also carries additive, transitional fields — `internalNotes`, discount/tax fields, nullable calculated totals (`subtotal`/`discountAmount`/`taxAmount` — not yet a final non-null contract), and unwritten finalization/archive fields — see Part 11 |
| `InvoiceLineItem` | **New in PR #65 (Slice 1) — schema-reserved only, no production writer/UI yet.** A single itemized line (description, quantity, unit price, line total, position) for a future itemized Invoice | belongs to one `Invoice`, cascades on delete; see Part 11 |
| `InvoiceEmailAttempt` | **New in PR #65 (Slice 1) — schema-reserved only, no production writer yet.** A single Invoice send/resend attempt and its provider-acceptance state | belongs to one `Invoice`, cascades on delete; optional actor `User`; see Part 11 |
| `Activity` | Append-only audit-log row for every mutation | entityId is *not* a foreign key (survives deletion of the entity it describes) |
| `Notification` | In-app inbox entry for a `User` | generated from a subset of Activity events, or written directly by the billing webhook |
| `NotificationDelivery` | Per-channel (currently email-only) delivery attempt/state | retry/cleanup jobs operate on this |
| `NotificationPreference` | Per-user, per-type in-app/email opt-out | lazy rows only when a user changes a default |
| `Attachment` | An uploaded file (Supabase Storage object) attached to a Client/Project/Invoice | `entityId` not a FK, same audit-friendly pattern as `Activity` |
| `Comment` | A threaded, plain-text comment on a Project or Task | soft-deletable (`deletedAt`), editable (`editedAt`) |
| `CommentMention` | An @-mention join row | drives the `MENTIONED` notification |
| `PortalUser` | **A separate client-facing login identity** (id = its own Supabase auth user id); carries a nullable `lastLoginAt` — a single mutable current-state timestamp of the most recent tracked portal authentication/activation event (a credential-backed portal login, or a genuine first invitation acceptance), never an event history | belongs to exactly one `Client`, never has a `Membership`, never resolved by staff auth helpers |
| `PortalDownloadRequest` | One immutable row per successfully issued portal attachment signed download link (Phase 22/PR #60) | belongs directly to `Organization` (survives a `Client`'s deletion); no `portalUserId`/`attachmentId`/`clientId`/PII — cannot identify who requested which document, and a row never proves the file transfer completed |
| `ClientInvitation` | A pending/accepted Client Portal invite by email | belongs to one `Client` (not `Organization` directly) |
| `Subscription` | One row per `Organization` — the local, provider-independent billing/entitlement source of truth | plan key, status, trial dates, Paddle customer/subscription ids |
| `WebhookEvent` | Idempotency ledger for incoming Paddle webhook deliveries | unique `providerEventId` |
| `OrganizationProfile` | Company/business-identity data (legal name, country, currency, timezone, logo, brand color, contact info, address) | one row per Organization, created lazily |
| `OrganizationPaymentDetails` | Where an org tells clients to send payment (bank name, account holder/number, SWIFT) | **not a payment processor** — plain text the org enters and reads back, OWNER-only |
| `OrganizationDomainSettings` | A saved custom domain + verification status | verification is a schema-only placeholder — never actually checked (see Part 24) |
| `OrganizationOnboardingStep` | Explicit skip/dismiss rows for the onboarding checklist | most steps are computed live from real data and never produce a row at all |

**Portal Analytics persistence (Phase 22/PR #60–#61):** `PortalUser.lastLoginAt` is a single mutable current-state timestamp of the most recent tracked portal authentication/activation event — either a successful, credential-backed portal login (which overwrites it) or a genuine first invitation acceptance (which initializes/updates it in that same accepted transaction; a repeated or already-accepted invitation click never reaches that write, since the transaction's own conditional `updateMany` only lets a genuine `PENDING -> ACCEPTED` transition proceed). It is not a login-event history — a later write overwrites the only evidence of an earlier one, so it can only ever answer "is this identity's most recent tracked event within some range right now," never "how many times did they sign in," and it cannot reconstruct previous-period login activity. `PortalDownloadRequest` is organization-only and cannot identify who requested which document; one row means "an authorized request received a signed download link," never that the file transfer completed. Historical data from before this persistence shipped (2026-08-15) was not, and cannot be, backfilled — every pre-existing `PortalUser` row has `lastLoginAt = NULL`, meaning "no tracked sign-in yet," not "never signed in, ever." The staff Analytics service now reads both of these real persistence sources (`getPortalEngagementCounts()`) alongside every other Portal metric — see Part 22's Analytics (portal) row. `PortalMetrics.totalPortalUsers` is the **current total** of existing `PortalUser` rows, unfiltered by the selected `TimeRange` — it is **not** a retained historical/lifetime count: a `Client` deletion cascades away its `PortalUser` rows, so deleted identities are never counted.

**Ownership/tenant model in one sentence:** a `User` reaches an `Organization` through `Membership`; every business entity carries `organizationId`; a `PortalUser` reaches an `Organization` only by joining through its one `Client` — the two identity spaces never share a table or a session-resolution code path.

---

## PART 5 — Authentication

Two fully separate, fully implemented authentication systems exist, both on Supabase Auth:

**Staff auth** (`src/app/(auth)/`, `src/lib/supabase/server.ts`, `src/lib/current-user.ts`):
- Signup (`/signup`) — public self-serve, creates a Supabase Auth user; `getOrCreateUser()`/`getOrCreateOrganizationId()` lazily provision the Prisma `User` row and a personal `Organization` (+ a `TRIALING` `Subscription`, atomically) on first real request, race-safe via a transaction + P2002-conflict fallback.
- Login (`/login`), logout, forgot-password (`/forgot-password`) → reset-password (`/reset-password`) — all implemented, all real Supabase Auth calls (`src/lib/auth/password-reset.ts`, `src/lib/auth/recovery-token.ts`).
- Email verification: handled via `src/app/auth/confirm/route.ts`, a real Supabase callback route.
- No OAuth/social login found anywhere in the codebase — email/password only.
- Session handling: Supabase's own cookie-based session, refreshed on every request by `middleware.ts`; server code always re-verifies via `getVerifiedAuthUser()` rather than trusting a cookie payload.
- Protected routes: every page under `(dashboard)` calls `getOrCreateUser()`/`getCurrentUserOrganization()` server-side; there is also a top-level guard in `(dashboard)/layout.tsx` and a defense-in-depth check inside `getOrCreateUser()` itself (a Portal-only identity can never get a staff `User`/`Organization` auto-provisioned, even via a background sidebar prefetch request).
- Redirects: unauthenticated → `/login`; a signed-in Portal identity landing on a staff page is redirected to `/portal`. `src/lib/safe-redirect.ts` sanitizes every `redirectTo` value so an open-redirect is never possible.

**Client Portal auth** (`src/app/portal/`, `src/lib/current-portal-user.ts`):
- Structurally separate signup/login/forgot-password/reset-password pages and Server Actions (`src/app/portal/login`, `/portal/signup`, `/portal/forgot-password`, `/portal/reset-password`), each targeting a `PortalUser` row rather than a staff `User`.
- Access is invitation-only: a staff member sends a `ClientInvitation`; accepting it creates the `PortalUser` row (id = the new Supabase auth user's id) — there is no open self-serve portal signup independent of an invitation.
- `getCurrentPortalUser()` is a strict, redirect-on-failure resolver used inside already-gated portal pages; `getOptionalPortalUser()` is a non-throwing variant used for identity-routing decisions. Neither ever provisions anything — a `PortalUser` row (with a `Client` that has a real `organizationId`) must already exist.

**Onboarding:** a dismissible "Getting started" checklist on the staff Dashboard, computed live from real Client/Project/Task/Membership/PortalUser data plus explicit skip/dismiss rows for the handful of steps with no data equivalent (Company Profile, Payment Details, Domain Setup, Welcome, Finish). A separate, simpler welcome banner exists on the Client Portal side.

---

## PART 6 — Workspaces / Multi-Tenancy / Roles

**Model:** every account is an `Organization`. A `User` joins one or more Organizations via `Membership` rows, each carrying a `Role` (`OWNER`/`ADMIN`/`MEMBER`).

**Creation:** automatic and lazy — the first time a new Supabase Auth user is resolved server-side, `getOrCreateOrganizationId()` creates a personal Organization (name from the signup form's company-name field if provided, else `"<name>'s Workspace"`), a unique slug, an `OWNER` Membership, and a `TRIALING` Subscription, all in one transaction.

**Active-organization resolution:** an httpOnly cookie (`active_organization_id`) records the user's last-chosen org as a UX preference only — it is **never trusted as an authorization decision**; every read re-verifies a live `Membership` row exists before honoring it, falling back to the user's `OWNER` org otherwise.

**Switching:** a real organization switcher (`getOrganizationSwitcherItems()`) lists every org a user belongs to (active first, then grouped by role, then alphabetically) for multi-membership users — visible in the app header.

**Invitations:** token-based, expiring, single-use, resend/cancel supported, email delivered via Resend with a copyable-link fallback. Accepting redirects safely through login/signup with a sanitized `redirectTo`.

**Roles/permissions:** enforced **server-side**, not just hidden in the UI — e.g. only an `OWNER` can manage `OrganizationPaymentDetails`; team-management/billing actions re-check the caller's role inside the Server Action itself, not just in the rendered page.

**Tenant filtering:** every business-entity query is scoped by `organizationId`, resolved server-side per request from the verified session — there is no client-supplied "current org" value anywhere in the trust chain.

---

## PART 7 — Dashboard

Route: `(dashboard)/dashboard/`. Fully real, database-driven — **no mock/demo data** in the current implementation.

- KPI cards: total clients, active projects, open tasks, overdue tasks, outstanding amount, paid revenue (period-scoped).
- A revenue-over-time bar chart, computed via `src/lib/dashboard/revenue.ts`'s bucketing logic.
- Three "Breakdowns" panels: invoice status, task status, project status counts (every known status shown, including zero-count ones).
- A URL-driven time-range selector (`7 days` / `30 days` / `90 days` / `Year to date`) — plain server-rendered links, no client JS, navigating via query string.
- The dismissible onboarding checklist (see Part 5) renders inline at the top when applicable.
- Recent activity feed (via `formatActivity()`), upcoming/overdue task list, recent invoices list.
- All queries live in `(dashboard)/dashboard/query.ts`, organization-scoped.

---

## PART 8 — Client Management

Route: `(dashboard)/clients/`. Full CRUD, organization-scoped.

- List (`clients/page.tsx` + `clients/query.ts`): search (name/company/email), status filter, sort, pagination.
- Create (`clients/new/`), edit (`clients/[id]/edit/`) — server-validated via `src/lib/validation/client.ts`.
- Delete — via a shared delete-button/confirm-dialog pattern.
- Statuses: `LEAD`/`ACTIVE`/`INACTIVE`/`ARCHIVED`.
- Relationships: a Client has Projects and Invoices (both visible from its detail page indirectly via their own lists) and can carry Attachments directly.
- Attachments: real Supabase Storage upload/download/delete, scoped to this Client (`clients/[id]/edit/attachments-section.tsx` + `attachment-actions.ts`).
- **Client Portal access** section on the client-detail page (`portal-access-section.tsx` + `portal-access-actions.ts`): invite a portal contact by email, see connected `PortalUser` rows, revoke access — this is the UI entry point into the entire Client Portal feature.
- Activity: every Client create/update/delete/attachment event is logged to the Activity timeline.

---

## PART 9 — Project Management

Route: `(dashboard)/projects/`. Full CRUD, organization-scoped, `src/lib/validation/project.ts`.

- List/search/filter (status, client) with pagination.
- Statuses: `PLANNING`/`IN_PROGRESS`/`ON_HOLD`/`COMPLETED`/`CANCELLED`.
- Fields: name, description, client (required), owner (a `User`), optional start/end date, optional budget (Decimal).
- Detail/edit page includes: Attachments section, and the **Comments** thread (see Part 13/Part 18) — this is the one entity type with the richest detail page.
- Tasks belong to a Project (see Part 10); Invoices reference a Project.
- No "assignees" concept at the Project level (assignment exists at the Task level only, via `Task.assigneeId`).
- Activity logging on every mutation; dashboard/analytics both aggregate project data.

---

## PART 10 — Task Management

Route: `(dashboard)/tasks/`. Full CRUD, organization-scoped (via its Project's org), `src/lib/validation/task.ts`.

- Statuses: `TODO`/`IN_PROGRESS`/`IN_REVIEW`/`DONE`. Priorities: `LOW`/`MEDIUM`/`HIGH`/`URGENT`.
- Fields: title, description, project (required), optional assignee (a `User`), optional due date, `completedAt` timestamp.
- List/search/filter by status/priority/project, sortable, paginated.
- Detail/edit page includes its own **Comments** thread (same shared comment system as Projects).
- Dashboard shows an upcoming/overdue tasks list; Analytics aggregates task counts/completion rate.
- Activity logging on create/update/delete/status-change.

---

## PART 11 — Invoices

Route: `(dashboard)/invoices/`. Full CRUD, organization-scoped, `src/lib/validation/invoice.ts`.

**The user-visible Invoice workflow is still flat-amount CRUD.** Invoice System Slice 1 (PR #65) added schema/calculation/compatibility groundwork for a future itemized invoice, but did not change the invoice form, list, or lifecycle a staff user actually interacts with. Read this section together with Part 2's new Phase 23 and `docs/invoicing-architecture.md` for the full target design and what's still ahead.

- Current form/action fields (`InvoiceForm` + `parseInvoiceForm()`): `invoiceNumber` (unique per client), `projectId`/Project selection, `amount` (Decimal), `status`, `dueDate`, `notes`. This is the complete current contract — verified directly against `src/components/invoices/invoice-form.tsx` and `src/lib/validation/invoice.ts`.
- `currency` is a persisted `Invoice` model field defaulting to `"USD"`, but the current form and `parseInvoiceForm()` do not expose, parse, or change it — every invoice is created/edited at whatever `currency` value the row already has (the schema default, for a new row).
- `issueDate` is not a current form/action input: creation receives the schema's `@default(now())` value and edit leaves it unchanged. It is nevertheless real persisted data and is read/rendered by the Client Portal invoice list and detail pages (`src/app/portal/(app)/invoices/page.tsx`, `.../invoices/[id]/page.tsx`, via `src/lib/client-portal/queries.ts`). Slice 2 owns making it staff-editable.
- `paidAt` is server-derived and never a submitted form field: create stamps it only when the initial submitted status is `PAID` (a direct two-way conditional, not a transition rule — there is no prior state at create time); edit alone applies the four-case status-transition rule (stamp on non-PAID→PAID, clear on PAID→non-PAID, preserve/omit otherwise).
- Slice 2 (`docs/invoicing-architecture.md`, unstarted) owns the future `currency` and issue-date form controls, alongside the itemized line-item/discount/tax UI.
- Statuses: `DRAFT`/`SENT`/`PAID`/`OVERDUE`/`CANCELLED`. Setting status to `PAID` stamps `paidAt`, which feeds the dashboard revenue chart. There is no `DRAFT`-only creation restriction and no lifecycle-transition enforcement yet — every status remains directly settable at create/edit time, exactly as before Slice 1; that restriction is Slice 2's, unstarted.
- Relationships: belongs to exactly one Client and one Project.
- Attachments supported (same shared attachment core as Clients/Projects).
- `organizationId` is now a required, schema-enforced (`NOT NULL`) tenant-scoping column (PR #63 fixed both the write path and the column's nullability — see Part 2's new Phase 23) — it is the primary tenant predicate on every Invoice query, with `project.organizationId` retained as defense-in-depth.
- The current invoice-numbering uniqueness constraint remains `@@unique([clientId, invoiceNumber])` — the target, organization-wide `[organizationId, invoiceNumber]` constraint (`docs/invoicing-architecture.md` §4.5) is explicitly deferred to a later slice, gated on a real-data collision preflight.
- `amount` remains the sole canonical total every existing Dashboard/Analytics/Search/Portal read consumes — the new Slice 1 `subtotal`/`discountAmount`/`taxAmount` columns are additive, nullable, dual-written for compatibility, and not read by any current UI.
- **Itemization/calculation foundation now exists in the schema, but has no production writer or UI (Invoice System Slice 1, PR #65):** the `InvoiceLineItem` and `InvoiceEmailAttempt` models exist and are schema-complete, but no Server Action, route, or UI creates a row in either table. `Invoice` gained discount (`discountType`/`discountValue`), tax (`taxRatePercent`/`taxLabel`), and calculated-total (`subtotal`/`discountAmount`/`taxAmount`) columns, but **no Invoice form exposes any of them** — the existing flat create/edit Server Actions dual-write compatibility values for these columns (`subtotal = amount`, discount/tax zeroed) so a rolling deploy never shows an inconsistent `subtotal: 0` next to a real `amount`, but a staff user cannot enter a line item, a discount, or a tax rate anywhere in the UI today. A pure calculation domain (`src/lib/invoices/calculations.ts`, `calculateInvoiceTotals()`) and a bounded currency-support module (`src/lib/invoices/currencies.ts`) exist and are fully unit-tested, but neither is called from any Invoice page yet — they are the foundation Slice 2's itemized UI will call.
- **Still explicitly not implemented:** an itemized create/edit UI (no discount/tax/currency/issue-date form controls exist); `DRAFT`-only lifecycle enforcement or a read-only "Issued" presentation; a cancel-and-duplicate correction flow; the actual finalization/Issue operation or any `issuerSnapshot`/`recipientSnapshot` write; PDF generation, archival, or download routes; a send-by-email flow or any `InvoiceEmailAttempt` writer; payment-processing/collection (status is still set manually by staff — there is no "pay this invoice" button anywhere for a client). Verified directly against the schema and a source-code grep for any line-item/email-attempt writer — not an assumption.
- Client Portal visibility: a connected `PortalUser` can see (read-only) the invoices belonging to their own Client, with an All/Open/Paid filter. The still-open `DRAFT`-visibility leak flagged in `docs/invoicing-architecture.md` §1.3 (a `DRAFT` invoice is reachable by a portal identity today) remains unfixed — that correction is Slice 5's.

---

## PART 12 — Client Portal (major differentiator)

This is one of the most fully-built and structurally deliberate features in the codebase.

**How a client gets access:** a staff member, from a Client's detail page, invites them by email (`ClientInvitation`, token-based, expiring). The client receives an email (Resend, with a copyable-link fallback), visits `/portal/invite/[token]`, and completes signup — this creates a `PortalUser` row whose `id` equals their new Supabase Auth user id.

**Authentication:** entirely separate pages/actions from staff auth (`/portal/login`, `/portal/signup`, `/portal/forgot-password`, `/portal/reset-password`), resolved via `src/lib/current-portal-user.ts`, never via the staff `getOrCreateUser()`/`getCurrentUserOrganization()` path. A `PortalUser` is never given a `Membership` and is never resolvable as a staff identity.

**Portal routes** (`src/app/portal/(app)/`): Overview (`page.tsx`), Projects (list + detail), Invoices (list + detail), Profile. Navigation is a distinct shell with its own "CLIENT PORTAL / <client name>" header — visually and structurally separate from the staff app.

**What a portal user can see:** only Projects and Invoices belonging to the one `Client` record they're attached to, plus that Client's Attachments (read-only, on the relevant project/invoice/client). **Zero access** to other clients, staff data, team management, billing, or analytics — enforced by `resolvePortalIdentity()` deriving `organizationId`/`clientId` purely from the `PortalUser` → `Client` relation, never from any client-supplied value.

**Messages:** there is **no portal-facing messaging/chat feature** — the only "communication" surface is the staff-only Comments system on Projects/Tasks (Part 13), which a Portal identity cannot see or use at all.

**Files:** portal users see read-only Attachments already uploaded by staff; there is no portal-side upload capability.

**Isolation:** verified both by direct code reading (`resolvePortalIdentity`) and by the E2E test suite (`staff-app.spec.ts`, portal-specific specs) and the dedicated `check-portal-welcome-security.mjs` static check.

---

## PART 13 — Communication / "Messages"

There is **no dedicated Message/Conversation model or portal-facing chat feature** in this repository. What exists instead:

- **Comments & Mentions** (`Comment`/`CommentMention` models, `src/lib/comments/`, `src/components/comments/`): threaded, plain-text comments on **Projects and Tasks only** (`CommentEntityType` = `PROJECT` | `TASK`), staff-only — never visible to or usable by a Client Portal identity. Supports `@name` mentions (parsed against real org members, resolved to a `CommentMention` row), edit (tracked via `editedAt`), and soft-delete (`deletedAt`, body replaced by a fixed placeholder, never hard-deleted).
- A mention triggers a `MENTIONED` Notification to the mentioned user; every comment create/edit/delete is logged to the Activity timeline.
- This is the entirety of "communication" functionality in the current codebase — there is no direct-message, group-chat, or client-facing comment thread.

---

## PART 14 — Files / Storage

`src/lib/storage/` + `src/app/api/attachments/[id]/download/route.ts` + `src/app/api/portal/attachments/[id]/download/route.ts`.

- Two Supabase Storage buckets: a **private** `attachments` bucket (Client/Project/Invoice files — the schema also reserves `AttachmentEntityType` room but Task attachments are not currently wired into any UI) and a **public** `logos` bucket (organization branding).
- Uploads: server-validated type/size allowlist (`src/lib/storage/attachments-config.ts`), a fresh server-generated `storagePath` (never derived from user input), metadata (`originalName`, `mimeType`, `sizeBytes`) stored in the `Attachment` row.
- Downloads: authenticated Route Handlers issue short-lived signed Storage URLs and return 307 redirects to them — they never expose a permanent public URL for the private bucket, and never stream/proxy the file bytes through Next.js (verified directly against both route handlers' source). The staff route (`/api/attachments/[id]/download`) scopes access by organization membership; the Client Portal has its own parallel download route (`/api/portal/attachments/[id]/download`) that additionally enforces Client-scoped portal attachment access, and records a `PortalDownloadRequest` row only after authorization and successful signed-URL generation (Phase 22/PR #60).
- Deletion: an Attachment delete removes both the DB row and the Storage object; deleting a parent Client/Project/Invoice cascades to delete its Attachments and their Storage objects (a dedicated cleanup pass, not an automatic DB-level cascade, since `entityId` is intentionally not a foreign key).
- UI: an `attachments-section.tsx` component pattern shared across Clients/Projects/Invoices, plus a read-only portal-side variant.

---

## PART 15 — Notifications

`Notification`/`NotificationDelivery`/`NotificationPreference` models, `src/lib/notifications/`.

- **Triggers:** a curated subset of Activity events (role changes, ownership transfer, member removal, staff/portal invitation acceptance, invoice status changes, comment @-mentions) plus billing-webhook-driven events (subscription activated/canceled, payment failed, plan changed) written directly by `src/lib/billing/notify.ts` — most routine Activity volume (ordinary create/update on Clients/Projects/Tasks, every Attachment event) is deliberately never notified.
- **Unread/read:** `readAt` timestamp, unread-first index; bell icon + badge in the header, full inbox at `/notifications`.
- **Email:** best-effort delivery via Resend (`src/lib/notifications/email/`), degrading gracefully when unconfigured; tracked per-channel in `NotificationDelivery` (currently email is the only implemented channel — the schema is channel-generic for future ones).
- **Preferences:** per-user, per-notification-type, in-app/email toggles (`/settings/notifications`), lazy rows (no row = both channels enabled by default).
- **Background jobs:** `src/lib/notifications/jobs/` — retry failed deliveries (with a stale-lock reclaim mechanism), cleanup of old notifications, and digest-candidate groundwork — invoked via two Vercel Cron routes (`vercel.json`) protected by `CRON_SECRET` (`src/lib/cron/auth.ts`).
- **Links/actions:** each notification's metadata carries enough structured data (never a pre-rendered string, never a token) for a formatter to render display text and a link to the relevant entity at read time.

---

## PART 16 — Settings / Account / Workspace Management

Route group: `(dashboard)/settings/`.

- **Company** (`settings/company/`) — the "Business Identity" configuration page: legal name, country, currency, timezone (all required, one-time-created row), plus optional logo upload, brand color, support email, website, phone, tax ID, and postal address.
- **Payment** (`settings/payment/`) — Payment Receiving Details (bank name, account holder, account number/IBAN, SWIFT/BIC, optional instructions) — OWNER-only read/write; explicitly **not** a payment processor integration, just where the org records where clients should send money.
- **Domain** (`settings/domain/`) — save a custom domain (or accept the generated `<slug>.<app-domain>` subdomain); verification status is a disclosed, inert placeholder (see Part 24).
- **Billing** (`settings/billing/`) — current plan/status/usage bars, Starter/Pro plan cards, "Manage subscription" (real Paddle Customer Portal redirect once configured).
- **Notifications** (`settings/notifications/`) — per-type channel preferences.
- **Team** (`(dashboard)/team/`) — members list, role management, ownership transfer, member removal/leave, pending invitations (resend/cancel), invite form.
- No separate generic "Profile"/"Account" page beyond what's covered by Team (your own row) and Company (org-level identity) was found in the route tree.

---

## PART 17 — UI/UX Work Already Completed

A real, consistent design system already exists — this should be extended, not rebuilt:

- **App shell:** a persistent sidebar (staff) with active-route highlighting, a header with organization switcher, global search, notification bell, and user menu; a structurally distinct Client Portal shell with its own header/nav.
- **Responsive/mobile:** explicit fixes exist in git history for mobile header overflow and tablet-breakpoint (768px) overflow, plus regression test coverage added afterward — this was a deliberate, tested pass, not incidental.
- **Reusable primitives** (`src/components/ui/`): `Button`, `Input`, `Textarea`, `Select`, `Table`, `StatusBadge`, `EmptyState`, `ConfirmDialog`, `DeleteButton`, `FormField`, `Skeleton`/`ListPageSkeleton`, `Icons`.
- **Empty states:** a dedicated, polished pass exists (`"Improve Clients/Projects/Tasks empty states for a fresh workspace"`) — not default browser/placeholder text.
- **Loading states:** every major list route has its own `loading.tsx` (skeleton UI), not a spinner-only fallback.
- **Error states:** `error.tsx`/`global-error.tsx` at multiple route-group levels.
- **Confirmation dialogs:** a shared `ConfirmDialog` pattern used consistently for destructive actions (delete client/project/task/invoice/comment, remove member, etc.).
- **Toasts:** `src/components/toast/` + `src/lib/toast-url.ts` (URL-param-driven toast messages after a Server Action redirect).
- **Forms:** a consistent server-validated `FormData` → typed-result → field-errors pattern used across every create/edit form in the app.

---

## PART 18 — Important Reusable Infrastructure

- `src/lib/current-user.ts` / `src/lib/current-portal-user.ts` — the two canonical "who is making this request, and what org/client can they act on" resolvers. **Every** authorization-sensitive page/action should go through one of these, never re-implement session/tenant resolution.
- `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/cookie-options.ts` — Supabase Auth client construction and cookie hardening.
- `src/lib/validation/*.ts` — one hand-rolled `FormData`-parsing validator per feature; the established pattern for any new form.
- `src/lib/rate-limit/` — centralized, in-memory, per-instance rate limiting (`index.ts`/`ip.ts`/`limits.ts`/`store.ts`), applied to auth/invitation/attachment/billing endpoints.
- `src/lib/activity/` — `createActivity()` is the single choke point every mutation logs through; per-entity metadata formatters.
- `src/lib/notifications/dispatch-notifications.ts` — the single fan-out choke point from an Activity row to Notification rows.
- `src/lib/storage/` — upload/download/delete helpers for both buckets, plus config (allowlists) per attachment type.
- `src/lib/billing/` — plan catalog, entitlements/enforcement, provider abstraction (`provider/provider.ts` resolves to the real Paddle adapter, the mock, or an "unconfigured" stub).
- `src/lib/analytics/` — a provider-neutral query/service layer feeding both the staff Analytics page and Portal analytics.
- `src/lib/search/` — per-entity search functions plus ranking/normalization, backing `/api/search`.
- `src/lib/format.ts`, `src/lib/list-params.ts`, `src/lib/safe-redirect.ts` — small shared formatting/URL-parsing/redirect-safety helpers used throughout.
- `scripts/security-checks/` — 14 standalone, CI-enforced static invariant checks (see Part 19) — the established pattern for encoding "this must never regress" as code rather than a comment.

---

## PART 19 — Security Work Already Implemented

**Implemented:**
- Server-side session verification on every protected page/action (`getVerifiedAuthUser()`), never trusting a client-supplied identity.
- `organizationId` scoping enforced in every business-entity query, resolved server-side from a verified `Membership`, never from client input.
- Role checks re-verified inside Server Actions (not just hidden in the UI) for sensitive mutations (team, billing, payment details).
- Supabase's auto-generated Data API is **fully locked down** — anon/authenticated Postgres privileges were explicitly revoked on all public-schema tables (migration `20260802120937_lockdown_public_schema_grants`), meaning the app deliberately does **not** rely on Postgres Row-Level Security policies for authorization — all authorization is application-layer, enforced through Prisma using a privileged server-side connection, with the Data API itself made inert as defense-in-depth. A dedicated check (`check-no-data-api-access.mjs`) guards this.
- Hardened Supabase Auth session cookie flags (httpOnly/secure/sameSite).
- Centralized rate limiting on auth, invitation, attachment, and billing-checkout/portal endpoints.
- Production-grade HTTP security headers.
- `sanitizeRedirectPath()` used everywhere a `redirectTo` value could otherwise enable an open redirect.
- Paddle webhook signature verification + idempotent processing (`WebhookEvent.providerEventId` unique constraint) — no unauthenticated write path into billing state.
- **14 dedicated, CI-enforced static security/invariant checks** (`scripts/security-checks/`, run via `npm run security:check`) — verified passing 14/14 during this investigation. They check things like: Platform Admin is never reachable from tenant code and never uses raw SQL; the Portal welcome banner can never leak org/user identifiers or write Activity/Notification rows; the search backend never touches Client Portal data and never console-logs; no raw SQL queries anywhere; no `dangerouslySetInnerHTML`; no secrets in public/client bundles; `TEST_MODE` bypass code can't leak into a real deployment path.
- A comprehensive automated test suite (2,044 tests, current baseline — see Part 21) including dedicated authorization/tenant-isolation integration tests (`test/integration/authorization/`, `test/integration/security/`) and E2E security-UI specs (redirect-safety, XSS-as-literal-text rendering).

**Known security-relevant gaps (disclosed, not hidden):**
- Rate limiting is **in-memory, per-instance** — not effective across multiple concurrent server instances in a horizontally-scaled deployment.
- No public OSS license file exists for the original application code (a legal/IP disclosure, not a code-security issue).
- Custom-domain DNS ownership is never actually verified (see Part 24) — a cosmetic/trust gap, not an access-control one, since the app's own tenant resolution never depends on the request's Host header.

---

## PART 20 — Production / Deployment Work

- **Vercel** is the target platform; `vercel.json` configures two scheduled Cron routes (notification delivery daily at 05:00 UTC, cleanup at 05:30 UTC), each protected by `CRON_SECRET`.
- **Environment handling:** every account-specific value (database, Supabase keys, email, billing, platform branding/legal text, admin allowlist) is an environment variable — `.env.example` documents every one by name (no real values committed; verified — real `.env*` files exist locally but are git-ignored). A standard deployment requires **zero application code changes**.
- **Database migrations:** 25 versioned SQL migrations under `prisma/migrations/`, applied via standard Prisma CLI workflow (`DIRECT_URL`, unpooled connection).
- **Supabase configuration:** `supabase/config.toml` present (local Supabase CLI config); Storage buckets (`attachments` private, `logos` public) must be created by whoever deploys their own instance (documented in the README's Storage setup section).
- **Seed/demo tooling:** `prisma/seed.ts` (plus `seed-organization.ts`/`seed-collaboration.ts`, extracted for direct test reuse) creates a realistic demo Organization with two staff members, six clients, seven projects, ten tasks, seven invoices, comments/mentions, notifications, and one connected Portal user. `prisma/backfill-organizations.ts`/`backfill-subscriptions.ts` are idempotent one-time backfill scripts for pre-multi-tenant/pre-billing data.
- **Logging/error handling:** `error.tsx`/`global-error.tsx` boundaries at multiple levels; no third-party error-tracking service (e.g. Sentry) integration was found in dependencies or code.
- **Analytics (product usage/telemetry):** no external analytics provider, no analytics tracking cookie, and no external telemetry pipeline anywhere in the app — the in-app "Analytics" feature (Part 13 of the app itself) analyzes the organization's *own* first-party business data. As of Phase 22/PR #60, this now also includes a narrowly-scoped, first-party Portal Analytics persistence: `PortalUser.lastLoginAt` (a current-state login/invitation-acceptance timestamp) and organization-scoped `PortalDownloadRequest` rows — deliberately not a tracking/telemetry system, with no per-user or per-document download linkage (see Part 4).
- **Live deployment:** the README documents a live demo URL (`client-portal-crm.vercel.app`) with three seeded demo logins — confirming a real Vercel deployment already exists and has been kept current through the sale-readiness phases (S1.1 verified the deployed HTML matched the latest branding via a direct `curl` check).

---

## PART 21 — Testing and Quality (results from checks run during this investigation)

All checks below were executed live against `main` @ `d76cd51c54594ae0f5743b1918fbae60ac8c1126`, the original investigation's baseline commit (non-destructively — no fixes applied, nothing committed):

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` (ESLint) | **Clean** — zero errors/warnings |
| Type check | `npx tsc --noEmit` | **Clean** — zero errors |
| Production build | `npm run build` (Next.js/Turbopack) | **Succeeds** — 43 routes compiled, static pages generated |
| Unit tests | `npx vitest run test/unit` | **1,086 passed**, 0 failed (72 files) |
| Integration tests | `npx vitest run --config vitest.integration.config.mts` | **494 passed**, 0 failed (58 files) — real Prisma against a local PGlite-backed Postgres |
| E2E tests | `npx playwright test --list` | **275 tests** across 28 spec files (full run confirmed passing in CI as of the last merged PR, #57) |
| Security checks | `node scripts/security-checks/run-all.mjs` | **14/14 passed** |

**Total automated tests: 1,855**, all passing as of `d76cd51c54594ae0f5743b1918fbae60ac8c1126`. Test directories cover: activity, analytics, attachments, auth, authorization, billing, comments, cron, invitations, notifications, onboarding, organization-setup, platform-admin, portal, search, security, and seed-script regression coverage — one integration-test directory per major feature domain.

**PR #58 (`13c480dca64428c66fcb9d05e340ae4d175d133b`, merged as `91234ade4cd5f9bc6cf28531e4355640a492ea56`) verification — scoped, not a repeat of the full sweep above.** This PR changed one E2E assertion in `test/e2e/staff-app.spec.ts`; it did not add, remove, or touch any other test, and the counts above (1,086 unit / 494 integration / 275 E2E / 1,855 total, 14 security checks) were **not re-run in full locally** after this change — there was no reason to expect them to move, since no test file was added or removed. What was actually verified for this specific commit: `npm run lint` (clean), `npx tsc --noEmit` (clean), `npm run build` (succeeded), and a targeted `npx playwright test test/e2e/staff-app.spec.ts` run (**5/5 passed**, including the changed sign-out test) — all run locally against commit `13c480d`. Separately, **GitHub CI ran its full configured gates on PR #58** before merge: `fast-checks` (pass), `integration` — the full Vitest integration suite plus the full Playwright E2E suite against a real production build (pass, 6m29s), and both Vercel checks (pass). The 1,855/14 figures should be read as "true as of `d76cd51`, and nothing in PR #58 gives any reason to expect them to have changed" — not as "independently re-counted after PR #58."

### Historical verification (Portal Analytics Slice 1 + Slice 2, PR #60–#61) — superseded, see Invoice System Slice 1 below for current totals

The figures above are frozen at `d76cd51`/PR #58 and preserved for provenance. The following were the up-to-date totals as of PR #60–#61 (Portal Analytics completion) — **preserved for provenance; no longer current.** See "Current verification (Invoice System Slice 1, PR #65)" immediately below for the current, up-to-date totals:

| Check | Result |
|---|---|
| Unit tests | 1,086 passed |
| Integration tests | 527 passed |
| E2E tests | 282 passed (29 spec files) |
| Total automated tests | 1,895 passed |
| Security checks | 14/14 passed |
| Lint | Clean |
| TypeScript | Clean |
| Production build | Succeeded |

**Provenance:** this full command suite passed on the exact approved PR #61 head, `a644f04f522b616e373ad743d129ced673278b2f` — the same commit GitHub CI independently validated before the PR was allowed to merge (`fast-checks` pass; `integration` pass — the full Vitest integration suite plus the full Playwright E2E suite against a real production build; both Vercel checks pass). The merge commit for PR #61, `a5049cba63cd906069f8c10ab4a2f30a3a47015b`, is a regular two-parent merge (`--merge`, no squash/rebase) whose second parent is that exact validated head — it introduces no content change beyond what CI already validated, so the full suite was intentionally **not** rerun a second time after the merge commit itself.

### Current verification (Invoice System Slice 1, PR #65)

The following are the **current, up-to-date totals** — this is what any current-tense test-count claim elsewhere in this document now means:

| Check | Result |
|---|---|
| Unit tests | **1,211 passed** |
| Integration tests | **551 passed** |
| E2E tests | **282 passed** |
| **Total automated tests** | **2,044 passed** |
| Security checks | **14/14 passed** |
| Lint | Clean |
| TypeScript | Clean |
| Production build | Succeeded |

**Provenance:** this full command suite passed on the exact approved PR #65 head, `78f09ae20d583ff60aa8447db0db0e59cc9bd60c` — the same commit GitHub CI independently validated before the PR was allowed to merge (`fast-checks` pass; `integration` pass — the full Vitest integration suite plus the full Playwright E2E suite against a real production build; both Vercel checks pass). `main`'s current merge commit, `34118012422f4434d6a183d6ca83f1a05c555101` (PR #65), is a regular two-parent merge (`--merge`, no squash/rebase) whose second parent is that exact validated head — it introduces no content change beyond what CI already validated, so the full suite was intentionally **not** rerun a second time after the merge commit itself. Since the historical PR #61 baseline (1,086 unit / 527 integration, 1,895 total), the suite grew by **125 unit and 24 integration tests** (2,044 − 1,895 = 149 total) across **both** PR #63 and PR #65 — not entirely PR #65. Attributed directly by running each added/changed test file in isolation against its introducing commit: **PR #63** added `test/unit/invoice-organization-migration-contract.test.ts` (12 unit) and `test/integration/invoices/organization-scope.test.ts` (12 integration) for the Invoice organization-scope repair — its other two changed integration files (`cross-org.test.ts`, `portal/authorization.test.ts`) were edited for accuracy/new call signatures with no net test-count change. **PR #65** added `test/unit/{invoice-calculations,invoice-currencies,invoice-slice1-migration-contract,client-validation}.test.ts` (41 + 37 + 16 + 18 = 112 unit) plus one new test in the existing `activity-metadata.test.ts` (24 → 25, +1 unit) for a total of 113 unit, and `test/integration/{invoices/slice1-flat-dual-write,clients/billing-identity}.test.ts` (5 + 7 = 12 integration). Sum: 12 + 113 = **125 unit** (matches 1,211 − 1,086 exactly); 12 + 12 = **24 integration** (matches 551 − 527 exactly). The E2E count (282) is unchanged — Slice 1 added no *new dedicated* E2E test, though it did add real, browser-testable user-facing behavior (the Client "Billing details" form section); that behavior received dedicated integration coverage instead (see above), and existing E2E coverage continued to pass. Separately, PR #65 minimally disambiguated **7 existing locator call sites, across 6 existing E2E tests, in exactly 5 spec files** (`activity.spec.ts`, `billing-enforcement.spec.ts`, `first-value-moment.spec.ts` [2 call sites, 2 tests], `security-ui.spec.ts`, `staff-app.spec.ts` [2 call sites, 1 test]) — each replaced an ambiguous substring-matched `page.getByLabel("Name")` with an exact accessible-name `page.getByRole("textbox", { name: "Name", exact: true })`, after the new "Billing legal name" field made the substring match resolve to two elements.

**CI/CD:** two GitHub Actions workflows (`.github/workflows/ci-fast.yml`, `ci-integration.yml`) — a fast lint/typecheck/unit pass and a full integration+E2E pass (real Postgres, real Playwright browser, real production build) gate every PR.

---

## PART 22 — Features That Look Complete vs. Actually Complete

| Feature | UI | Backend | DB persistence | Authorization | End-to-end functional | Status |
|---|---|---|---|---|---|---|
| Clients CRUD | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Projects CRUD | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Tasks CRUD | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Invoice CRUD (flat-amount) | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Invoice organization scoping (`organizationId`) | n/a | ✅ | ✅ | ✅ | ✅ | **REPAIRED AND COMPLETE** (PR #63 — was silently unwritten by production code before; see Part 2 Phase 23) |
| Invoice calculation/compatibility foundation (`calculateInvoiceTotals()`, currency contract, flat-invoice dual-write, Client billing identity) | Client-billing UI only | ✅ | ✅ — real DB persistence for the flat-invoice transitional-total dual-write and the Client billing fields | ✅ | n/a (no new Invoice-facing workflow) | **SLICE 1 COMPLETE** (PR #65) — no Invoice-facing UI yet |
| `InvoiceLineItem` / `InvoiceEmailAttempt` production write paths | ❌ | ❌ | ❌ — schema exists (tables are migrated), but no Server Action/route ever writes a row; a table existing in the schema is not a persistence path | — | ❌ | **NOT IMPLEMENTED** (schema-reserved only; Slice 2+ eventually writes these) |
| Itemized Invoice UI / lifecycle enforcement | ❌ | ❌ | ❌ | — | ❌ | **NOT IMPLEMENTED** (Slice 2, unstarted) |
| Invoice PDF archive/export | ❌ | ❌ | — | — | ❌ | **NOT IMPLEMENTED** (Slice 3, unstarted) |
| Invoice email delivery (send/resend) | ❌ | ❌ | — | — | ❌ | **NOT IMPLEMENTED** (Slice 4, unstarted) |
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Analytics (staff) | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Analytics (portal) | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** (the 2 metrics flagged as needing new persistence at Phase 13 were completed by Phase 22/PR #60–#61 — persistence, write paths, tenant-scoped queries, types, scalar UI cards, corrected empty-state, and full integration/E2E coverage; limitations remain by design, see Part 4 and Part 24) |
| Multi-tenancy / Organizations | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Team & roles | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Staff invitations | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Client Portal (identity + views) | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Client Portal invitations | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Attachments | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Activity timeline | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Comments & mentions | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Notifications (in-app) | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Notifications (email) | ✅ | ✅ | ✅ | ✅ | ✅ (degrades gracefully if unconfigured) | **COMPLETE** |
| Onboarding checklist | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Global search | ✅ | ✅ | n/a (live query) | ✅ | ✅ | **COMPLETE** |
| Billing plan/entitlements | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Paddle checkout/portal/webhook | ✅ | ✅ | ✅ | ✅ | implemented, **never exercised against a live Paddle sandbox** | **MOSTLY COMPLETE** (code-complete; live validation is a buyer/operator step, not a code gap) |
| Billing reconciliation / trial-ending reminders | — | ❌ | — | — | ❌ | **NOT BUILT** (disclosed roadmap item) |
| Company/Business Identity settings | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Payment receiving details | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** (plain-text record only, not a payment processor) |
| Custom domain settings | ✅ | ✅ | ✅ | ✅ | UI/storage work, **verification step is a permanent placeholder** | **PARTIAL** (disclosed) |
| Platform Admin console | ✅ | ✅ | ✅ (read-only) | ✅ | ✅ | **COMPLETE** (read-only by design) |
| Legal pages (Privacy/Terms) | ✅ | n/a | n/a | n/a | ✅ | **COMPLETE** |
| Password recovery (staff + portal) | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Rate limiting | n/a | ✅ | in-memory only | n/a | ✅ per-instance | **MOSTLY COMPLETE** (correct for a single-instance deployment; not multi-instance-safe) |

---

## PART 23 — Mocks / Placeholders / Unfinished Work (found via keyword + behavioral search)

A repository-wide search for `TODO`/`FIXME`/`mock`/`placeholder`/`hardcoded`/`temporary`/`fake` (excluding generated Prisma code) found **no hidden unfinished handlers, no fake success states, and no disconnected forms**. What the search actually surfaced:

- `TODO` occurrences are exclusively the literal `TaskStatus.TODO` enum value (a real, first-class task status) — not code-comment TODOs.
- `mock` occurrences are exclusively: (a) the legitimate, deliberately-built billing **mock provider** (`src/lib/billing/provider/mock-provider.ts`, `src/app/billing/mock/`), active only under `TEST_MODE`, used by the E2E suite to exercise the full checkout/webhook pipeline without a real Paddle account, and (b) test-file mocking of Resend/Supabase calls in unit tests — both intentional, documented test infrastructure, not product-facing fakery.
- `placeholder` occurrences are exclusively: HTML `<input placeholder="...">` attributes, the `DELETED_BODY_PLACEHOLDER` text a soft-deleted comment renders instead of its real body (an intentional, disclosed design choice), and the `DomainVerificationStatus`/`OnboardingStepKey.REVIEW_BILLING`-style schema comments that explicitly self-describe as "an honest placeholder, not a guessed future state" — i.e. the codebase's own comments proactively flag exactly where something is inert, rather than hiding it.
- No hardcoded IDs, fake metrics, or disconnected forms were found — every form submits to a real Server Action that validates and writes to the database (confirmed by reading the actions, not just the forms).

**The one behavioral (not keyword-detectable) gap worth flagging explicitly:** `OrganizationDomainSettings.verificationStatus` is set to `PENDING` on every save and **no code path anywhere ever sets it to `VERIFIED`** — this is a real, permanent no-op today, not a bug, but it will read as "broken" to anyone who doesn't already know it's an intentionally deferred feature (it is disclosed in the README's Roadmap section and in the model's own schema comment).

---

## PART 24 — Known Bugs / Technical Debt

- **RESOLVED — the two previously-stale branches.** `fix/stage-6-2-1-auth-refresh-race` and `test/stage-6-2-2-e2e-selector-hardening` (both flagged as unmerged/undecided in the original investigation) have since been fully triaged and deleted (PR #58, `91234ade4cd5f9bc6cf28531e4355640a492ea56`). Findings: the auth branch's `auth: { autoRefreshToken: false }` change was **closed as redundant/superseded** — direct inspection of the exact installed `@supabase/ssr@0.12.4` dependency (source, both compiled builds, and a live runtime probe of the actual installed `createServerClient()`) proved that this package already unconditionally forces `autoRefreshToken: false`, `detectSessionInUrl: false`, `persistSession: true`, `skipAutoInitialize: true`, and `flowType: "pkce"` on every call — these literal values are spread *after* `...options?.auth` in the package's own merge order, so a caller cannot override them regardless of what it passes. `main`'s runtime auth configuration was therefore already identical to what the branch tried to set, with or without the branch; nothing from it was carried forward (no auth options, no two mock-based unit tests, no root-cause commentary). The selector branch was carried forward **only** for its sign-out test simplification — `test/e2e/staff-app.spec.ts` now uses a direct `page.getByRole("button", { name: "Sign out", exact: true })` (verified unambiguous: exactly one element with that accessible name exists on any dashboard page, confirmed back to the E2E suite's original introducing commit) — its `data-testid` additions, the shared `settings-save-button` id, the three settings-form changes, and the proposed `docs/testing.md` selector-convention section were all deliberately **not** adopted, since the existing `getByRole` selectors were already unambiguous, already matched this codebase's established convention, and preserve real accessible-name verification that a test id would not. See Part 2's Phase 21 for the full disposition. **Separately, and not resolved by this triage:** the historical "redirect-after-save" symptom the auth branch was originally chasing remains genuinely unconfirmed on current `main` — this triage only eliminated client-side/server-wrapper `autoRefreshToken` configuration as its explanation for this exact dependency version; it did not reproduce, explain, or rule out the symptom itself. If it needs to be closed out, that requires a separate, live, production-like validation against a real Supabase Auth environment (this repository's `TEST_MODE` bypasses real Supabase Auth entirely, so no test tier here can exercise it) — treat this as an open validation item, not a confirmed current bug.
- **RESOLVED — Analytics Portal metrics.** The commit that introduced Portal analytics explicitly flagged 2 metrics ("Recently active portal users," "Document download count") as "requiring new persistence" at the time it shipped (Phase 13, 2026-08-07/08). This gap was closed by **Phase 22 / PR #60–#61** (2026-08-15): minimal, explicitly-approved persistence (`PortalUser.lastLoginAt`, the organization-only `PortalDownloadRequest` model) written only on genuine login/invitation-acceptance/download-link events; honest scalar semantics (both new `PortalMetrics` fields are plain current-range counts, deliberately never a `GrowthMetric`, since `lastLoginAt` cannot support a previous-period comparison); full tenant isolation (`PortalDownloadRequest` scoped directly by `organizationId`, `PortalUser` scoped through `Client`); a privacy-preserving shape (no per-user/per-document linkage, enforced by a rewritten, exact-allowlist `check-analytics-security.mjs` check #13); correct half-open `[start, end)` boundary handling and a true, unsubstituted `allTime`; and dedicated integration and E2E test coverage for the new behavior, with the full, unchanged unit regression suite also passing (no dedicated unit tests were added — the new behavior has no isolated pure-function logic to unit-test; it is exercised through real Prisma/Server Action integration tests and browser-level E2E). No fake/proxy metric was introduced — both numbers are real counts from real, newly-added persistence, not a repurposed existing signal. See Part 2's Phase 22 and `docs/analytics-architecture.md` §12.2a/§12.2b for the complete writeup.
- **Domain verification is a permanent no-op** (see Part 23) — not a bug per se, but will look like one to an unfamiliar reader of the Settings → Domain page.
- **No itemized invoice UI, no invoice-facing PDF export, no invoice email delivery** — an active, in-progress multi-slice effort (Invoice System Slices 2–5, see Part 2's new Phase 23 and Part 28), not an abandoned gap: the schema/calculation/currency/Client-billing foundation shipped in Slice 1 (PR #65), but no staff-facing UI or backend behavior for itemization, lifecycle enforcement, PDF, or email exists yet.
- **Rate limiting is per-instance/in-memory** — correct for today's likely single-instance deployment, but will silently under-enforce limits the moment the app runs on more than one server instance.
- **No public OSS license file** — a legal/provenance gap, not a code gap (see the S2 sale-package work referenced in git history/session context for full disclosure language).
- **`.env`, `.env.local`, `.env.production.local`, `.env.test` all exist as real (git-ignored) files locally** — normal for local development, but worth flagging that this repository, as currently checked out on this machine, has real local environment configuration present; nothing in this investigation read or disclosed their contents.

---

## PART 25 — "WHAT HAS ALREADY BEEN BUILT" (human-readable summary)

Client Portal CRM is a genuinely complete, working multi-tenant SaaS application — not a landing page with a database table behind it, and not a single-tenant CRUD demo with tenancy bolted on as an afterthought.

**The core CRM** — Clients, Projects, Tasks, Invoices — is fully built: real create/edit/delete flows, real search/filter/sort/pagination, real status lifecycles, real relationships between entities, all scoped correctly to whichever Organization the current user is acting as.

**An Invoice System upgrade is in progress, one slice at a time — flat-amount invoicing today, itemized invoicing being built underneath it.** The invoice a staff user creates or edits right now is still exactly the flat-amount document it always was — nothing about the visible form or lifecycle changed. But `Invoice.organizationId` (the tenant-scoping column) was repaired from a silent, previously-unwritten defect to a required, correctly-written column (PR #63); a full target architecture for itemization/lifecycle/PDF/email was approved and documented (PR #64, `docs/invoicing-architecture.md`); and the first implementation slice shipped the additive schema (`InvoiceLineItem`, `InvoiceEmailAttempt`, discount/tax/calculated-total columns), a pure Decimal calculation engine, a bounded invoice-currency contract, and real optional Client billing-identity fields with their own form (PR #65, Slice 1). None of the itemized-invoice UI, lifecycle enforcement, PDF archive, or email delivery exists yet — that's Slices 2–5, not started.

**Multi-tenancy is real, not cosmetic.** Every business table carries an `organizationId`; every query is scoped server-side from a verified session, never from anything the client could tamper with; an organization switcher lets a user move between multiple workspaces they belong to; roles (Owner/Admin/Member) are enforced in the Server Actions themselves, not just hidden in the UI.

**The Client Portal is the standout feature.** It is a structurally separate identity system — a `PortalUser` is never a `User`, never has a `Membership`, and is resolved through completely different code paths — giving a freelancer's own clients a genuine, isolated, self-service view of their own projects and invoices. This is the single feature that most differentiates this codebase from a generic CRM template, and it is fully implemented end to end: invitation, signup, login, scoped read-only views, and isolation that's been both code-reviewed and test-covered.

**A real, working billing system exists**, not a stub: a typed plan catalog with server-enforced entitlements (member/client/project/storage limits), and a genuine Paddle integration — checkout, Customer Portal, and signature-verified webhook processing — that activates automatically once a real Paddle account is connected, with zero code changes required. It has never been exercised against a live Paddle sandbox, which is disclosed plainly rather than hidden.

**A full internal collaboration layer exists**: an append-only Activity audit log behind every mutation, threaded comments with @-mentions on Projects and Tasks, and a real Notification Center (in-app + best-effort email + background retry/cleanup jobs) — this is meaningfully more than most CRM MVPs build.

**Supporting systems are also real, not decorative**: a live-computed onboarding checklist, a staff Analytics dashboard with real charts over real data, cross-entity global search, a Business Identity/company-profile settings area with logo upload, a read-only Platform Admin console for whoever operates the deployment across all tenants, and Privacy Policy/Terms of Service pages with consent surfacing.

**Security work is substantial and verifiable, not asserted.** The Supabase auto-generated Data API has been deliberately locked down at the database-privilege level so the app's own server-side authorization is the only path to the data; session cookies are hardened; rate limiting and HTTP security headers are in place; and 14 dedicated, CI-enforced static checks continuously guard specific tenant-isolation and identity-separation invariants.

**The engineering process itself is mature.** 2,044 automated tests (unit, integration against a real Postgres, and full end-to-end browser tests) currently pass, alongside a clean lint run, a clean TypeScript check, and a successful production build — verified on the exact approved head of the most recent merged PR (#65), with GitHub CI independently validating the same commit before merge (see Part 21's "Current verification (Invoice System Slice 1, PR #65)" subsection). Two GitHub Actions workflows gate every change.

**What is genuinely not finished** is a short, specific, already-disclosed list rather than a vague sense of incompleteness: custom-domain DNS verification is a permanent no-op, itemized Invoice UI/lifecycle/PDF export/email delivery remain unbuilt (the underlying schema/calculation foundation shipped in Slice 1, PR #65, but Slices 2–5 haven't started), billing reconciliation/trial-ending reminders don't exist yet, and rate limiting doesn't yet work across multiple server instances. None of these are hidden — they're stated in the README's own Roadmap section and confirmed independently in this investigation.

---

## PART 26 — Current State of the Product

Based on the evidence gathered in this investigation, Client Portal CRM sits at: **a functional, feature-complete SaaS application that has never processed a real transaction or served a real paying customer** — best described as an **advanced, near-production MVP**, not a prototype, and not yet a battle-tested production SaaS.

**What already works, end to end, right now:** every core CRM workflow, real multi-tenant isolation, the full Client Portal, a real (if never live-fired) billing integration, notifications, comments, search, analytics — now including the completed Portal Analytics engagement metrics (Phase 22/PR #60–#61) — onboarding, a repaired and schema-enforced Invoice tenant-scoping column plus the first Invoice System implementation slice (schema/calculation/currency/Client-billing foundation, Phase 23/PR #63–#65), and a clean automated-quality bar (lint/typecheck/build/2,044 tests all currently green).

**What prevents calling it "production-ready" today:**
1. The Paddle integration has never been validated against a real sandbox account — first real-money code path is still unproven in practice, even though it's fully implemented and unit/integration/mock-tested.
2. No real customer or usage history exists anywhere — every "org" in the system so far is a demo/seed/test artifact.
3. A handful of specific, bounded functional gaps remain open: domain verification, the itemized Invoice UI/lifecycle/PDF/email work still ahead in Invoice System Slices 2–5, billing reconciliation, and multi-instance rate limiting.

This is **not** a "rebuild from scratch" situation. It's a "validate, close the known gaps, and go live" situation.

---

## PART 27 — Context the Next Assistant Must Preserve

**Preserve, don't rebuild:**
- The multi-tenant data model (`Organization`/`Membership`/`organizationId` scoping) — this was a deliberate, carefully-executed retrofit (Phase 1) that every subsequent feature was built on top of. Re-deriving it from scratch would be a massive regression.
- The staff (`User`) vs. Client Portal (`PortalUser`) identity separation — this is intentional and structural, not accidental duplication. Never merge these into one table or one auth code path; the schema comments explicitly explain why they're kept apart.
- The Server Components + Server Actions architecture — there is no REST/GraphQL API layer for the app's own UI, and none should be introduced without a strong reason; this is a deliberate, consistent choice throughout, not an oversight.
- The hand-rolled `FormData` validation pattern (`src/lib/validation/*.ts`) — consistent across the whole app; introducing a schema library (e.g. Zod) partway through would fragment the codebase's own conventions.
- The append-only Activity log + Notification fan-out pattern — both are single-choke-point designs (`createActivity()`, `dispatchNotificationsForActivity()`) specifically so future features plug into one place rather than scattering logging/notification logic everywhere.
- The Data-API-lockdown security model — authorization is enforced entirely in application code (Prisma + server-verified session), *not* via Postgres RLS policies, which are deliberately made inert. Do not assume RLS policies exist or would do anything if a table's grants were restored — that would silently reopen the tenant boundary the "no RLS" security check exists to prevent.
- The provider-neutral billing adapter pattern (`src/lib/billing/provider/provider.ts`) — the real Paddle adapter, the mock, and an "unconfigured" stub are resolved through one interface; a future second provider should follow the same shape.
- The 14 `scripts/security-checks/` static checks and the 2,044-test suite — treat a red result here as a real regression signal, and extend this pattern (a new invariant gets a new check) rather than inventing a different verification mechanism.
- **The Portal Analytics privacy boundary (Phase 22/PR #60–#61)** — new, narrow, and easy to accidentally widen:
  - `PortalUser.lastLoginAt` remains a single mutable current-state timestamp; do not turn it into per-login history without a separate privacy/design review.
  - `PortalDownloadRequest` must remain organization-only and must not acquire `portalUserId`, `attachmentId`, `clientId`, PII, or URL/storage/auth/session metadata without explicit review — `check-analytics-security.mjs` check #13 enforces this as an exact field allowlist, not a keyword ban.
  - The two new Portal metric queries (`getPortalEngagementCounts()`) use literal selected `TimeRange` bounds; do not route them through `growthBounds`/`DEFAULT_GROWTH_TIME_RANGE` the way growth-comparison metrics are.
  - The two new cards ("Recently active portal users," "Download-link requests") are intentionally plain scalars, not `GrowthMetric`/chart data — don't add a trend chart or previous-period comparison without re-deriving whether the underlying data can honestly support one (`lastLoginAt` currently cannot).

**Dangerous to change without understanding first:**
- `getCurrentUserOrganization()`/`getCurrentMembership()`/`getCurrentPortalUser()` — the entire authorization boundary funnels through these few functions. Any change here has tenant-isolation blast radius.
- The Supabase Data API grants migration (`20260802120937_lockdown_public_schema_grants`) — restoring public-schema grants without re-adding equivalent RLS policies would reopen a real security hole, since the app currently assumes the Data API is inert.
- `entityId` fields that are deliberately *not* foreign keys (Activity, Notification, Attachment, Comment) — this is intentional (so history survives deletion of the thing it describes), not a modeling mistake; "fixing" it into a real FK would break the audit-log philosophy those models were built around.
- The `active_organization_id` cookie — it is explicitly documented as a UX preference only, never an authorization decision; every read re-verifies a live Membership. Don't start trusting it directly.

**Conventions to follow:**
- One `docs/<feature>-architecture.md` design doc per major feature (Analytics, Billing, Comments, Notifications, Onboarding, Search) — written *before* implementation, in past phases; continuing that habit for new major features would match the project's own established practice.
- PR-per-feature-slice development with a merged branch cleaned up afterward — consistently followed (the two branches that briefly sat unmerged were investigated and resolved via PR #58; see Part 2's Phase 21 and Part 24).
- Every new capability gets real automated test coverage across the same three tiers (unit/integration/E2E) this project already uses, not just manual verification.

---

## PART 28 — Remaining Gaps (only what's needed to close, not a wishlist)

**Critical (blocks calling this "production-ready"):**
- Real Paddle sandbox validation has never been performed — this is the single highest-priority item before accepting real payments.

**Core functionality gaps:**
- Custom-domain DNS verification is entirely unimplemented (permanent "pending" state today).
- **Invoice System — Slice 1 (schema/calculation/currency/Client-billing/flat-dual-write foundation) is complete (PR #65); Slices 2–5 remain, not started.** The immediate next development slice, if invoicing continues, is **Slice 2**: staff itemized `DRAFT` create/edit UI, server-side recomputation/persistence of totals via the already-built `calculateInvoiceTotals()`, `DRAFT`-only creation and lifecycle-transition enforcement for existing non-`DRAFT`/legacy invoices, a read-only "Issued" presentation, `internalNotes` behavior, delete restricted to `DRAFT`, cancel-and-duplicate, and a lifecycle/finalization service *contract* only (the interface Slice 3 will implement against) — Slice 2 does **not** implement any actual Issue/finalize/PDF/email behavior. PDF generation/archival/download (Slice 3) and Invoice send/resend email (Slice 4) remain real, unstarted product gaps. The final `NOT NULL` contract on the calculated-total columns, the organization-wide invoice-numbering constraint, the corrected portal DRAFT-visibility fix, and final whole-feature test/seed/doc closure are Slice 5's, also unstarted. Both Invoice migrations merged so far (`20260911090000_repair_invoice_organization_scope`, `20260912090000_add_invoice_system_slice1_foundation`) still require a separate, controlled deployment/operator step against any real external/staging/production database — neither has been applied outside this repository's local ephemeral test harness. See `docs/invoicing-architecture.md` for the complete slice plan.
- Billing reconciliation and trial-ending reminder notifications don't exist yet.

**Production readiness:**
- Rate limiting needs to move off in-memory/per-instance storage before running more than one server instance.
- No error-tracking/observability service (e.g. Sentry) is integrated — errors are caught by boundaries but not centrally reported.
- IP/licensing posture: no OSS license file exists for the original code — a legal decision needed before any public distribution, independent of any commercial sale process.
- **Low-confidence validation item, not a confirmed defect:** a historical "save on Settings redirects to /login" symptom was chased (pre-`main`, in the now-deleted `fix/stage-6-2-1-auth-refresh-race` branch) but never conclusively explained; client-side/server-wrapper `autoRefreshToken` configuration has since been ruled out as its cause for the exact `@supabase/ssr` version this project uses (that package forces the relevant auth options unconditionally regardless of caller input — see Part 24). Whether the underlying symptom still occurs on current `main` is unknown — it cannot be tested by any tier this repository has (`TEST_MODE` bypasses real Supabase Auth) and would need a dedicated, live, production-like reproduction against a real Supabase Auth environment to close out. Not blocking, not confirmed — a validation task, should it ever be worth pursuing.

**UX/polish:**
- No item flagged as broken UX was found during this investigation beyond the disclosed domain-verification no-op; further polish is a product-priority decision, not a defect list.

**Optional:**
- A second billing provider, a push/SMS notification channel, a portal-facing messaging feature — real product ideas, none started, none required for the current feature set to function. (Invoice itemization is no longer in this "none started" category — its schema/calculation foundation is Slice 1-complete; see the Invoice System gap above.)

---

# READY-TO-PASTE CONTEXT FOR NEW CHATGPT CHAT

You are continuing development of an **existing, substantially-built** multi-tenant CRM SaaS application called **Client Portal CRM**. It is not a new project and should not be treated as a blank slate. The current application-state baseline is `main` @ commit `34118012422f4434d6a183d6ca83f1a05c555101` (170 commits) — the original full investigation was performed earlier, at commit `d76cd51c54594ae0f5743b1918fbae60ac8c1126`, and `main` has since moved forward through eight PRs: #58 (a one-line test housekeeping change), #59 (added this document to version control, documentation-only), #60–#61 (**Portal Analytics completion**), #62 (a prior documentation-only refresh of this file), #63–#65 (**Invoice System: organization-scope repair, approved architecture, and Slice 1 foundation** — see below). The following has already been built and verified working: lint clean, TypeScript clean, production build succeeds, **2,044 automated tests passing**, 14 dedicated security checks passing — the full command suite passed on the exact approved head of PR #65 (the latest application change), independently confirmed by GitHub CI before merge (see Part 21's "Current verification (Invoice System Slice 1, PR #65)" subsection for full provenance).

**Product:** a CRM for freelancers/agencies — Clients, Projects, Tasks, Invoices — plus a genuinely separate **Client Portal** where a freelancer's own clients log in with their own identity to see only their own projects/invoices. This Client Portal is the product's strongest differentiator versus a generic CRM template.

**Architecture:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Prisma 7 against PostgreSQL (Supabase-hosted), Supabase Auth (two separate identity spaces — staff `User` and portal `PortalUser`), Supabase Storage (private `attachments` bucket + public `logos` bucket), deployed on Vercel. **No REST/GraphQL API for the app's own UI** — Server Components read via Prisma directly, mutations go through Server Actions; a handful of real Route Handlers exist only for webhooks, file downloads, cron, and search. No client-side data-fetching library, no global state library, no schema-validation library (validation is hand-rolled `FormData` parsing per feature).

**Database:** 26 Prisma models, 22 Prisma enums, 25 migrations. Every business entity carries `organizationId` for tenant scoping. Key models: `User`, `Organization`, `Membership` (role: Owner/Admin/Member), `Invitation`, `Client` (now with seven optional billing-identity fields — `billingLegalName`/`taxId`/`streetAddress`/`city`/`state`/`postalCode`/`country`, PR #65), `Project`, `Task`, `Invoice` (`organizationId` required/repaired PR #63; additive Slice 1 discount/tax/calculated-total/finalization columns from PR #65 — `subtotal`/`discountAmount`/`taxAmount` remain deliberately nullable until Slice 5's contract migration, and unread by any current UI), `InvoiceLineItem`/`InvoiceEmailAttempt` (**new in PR #65, Slice 1 — schema-reserved only, no production writer/UI yet**), `Activity` (append-only audit log), `Notification`/`NotificationDelivery`/`NotificationPreference`, `Attachment`, `Comment`/`CommentMention`, `PortalUser` (nullable `lastLoginAt` — a single mutable current-state timestamp of the most recent tracked portal login or genuine first invitation acceptance, not a login history) / `ClientInvitation` (the separate client-facing identity), `PortalDownloadRequest` (organization-only, immutable download-link-issuance events — Phase 22/PR #60), `Subscription`/`WebhookEvent` (billing), `OrganizationProfile`/`OrganizationPaymentDetails`/`OrganizationDomainSettings`, `OrganizationOnboardingStep`.

**Auth:** Supabase Auth for both identity spaces, fully separate code paths (`src/lib/current-user.ts` for staff, `src/lib/current-portal-user.ts` for portal) — never merge these. Signup, login, logout, forgot/reset password all work for both. No OAuth. Email verification via a real Supabase callback route.

**Multi-tenancy:** real, not cosmetic — every query is scoped server-side from a verified session; an `active_organization_id` cookie is a UX preference only, always re-verified against a live Membership before being trusted; an organization switcher exists for multi-membership users; roles are enforced in Server Actions, not just hidden in the UI.

**Already built and working end-to-end:** Clients/Projects/Tasks/Invoices (flat-amount) CRUD; Dashboard with real KPIs/charts; staff Analytics with real trend charts, **including the now-complete Portal Analytics engagement metrics** ("Recently active portal users" and "Download-link requests" — plain current-range scalar counts backed by real, minimal, privacy-preserving persistence added in Phase 22/PR #60–#61, deliberately not `GrowthMetric`s/charts); Team & role management; staff and Client Portal invitations; file Attachments (Supabase Storage) on Clients/Projects/Invoices; an Activity audit-log timeline; threaded Comments with @-mentions on Projects/Tasks (staff-only, no portal-facing messaging exists); a Notification Center (in-app + best-effort email + background retry/cleanup cron jobs); a live-computed Onboarding checklist; cross-entity global search; a Business Identity/company-profile settings area with logo upload; Payment Receiving Details (a plain-text record, not a payment processor); a read-only Platform Admin console for the deployment operator across all tenants; Privacy Policy/Terms of Service pages; password recovery for both staff and portal users; and a real, typed billing plan catalog with server-enforced entitlements plus a genuine Paddle integration (checkout, Customer Portal, signature-verified webhooks) that activates automatically once a real Paddle account is configured.

**Invoice System — in progress, one approved slice at a time (Phase 23/PR #63–#65):** `Invoice.organizationId` was repaired from a silently-unwritten, nullable column to a required, correctly-written tenant-scoping column (PR #63; the repair migration has not been applied to any external/staging/production database — that remains a separate operator step). A full target architecture (`docs/invoicing-architecture.md`) was approved, covering itemization, lifecycle, PDF archival, email/idempotency, portal visibility, and a five-slice implementation plan (PR #64, documentation-only). **Slice 1 is complete** (PR #65): the new `InvoiceLineItem`/`InvoiceEmailAttempt` models exist but have **no production writer or UI yet**; `Invoice` gained additive discount/tax/calculated-total/finalization columns (the calculated totals stay nullable — no `NOT NULL` contract yet); a pure `calculateInvoiceTotals()` Decimal calculation engine and a bounded invoice-currency module exist and are fully unit-tested but not called from any Invoice page yet; the existing flat create/edit actions dual-write compatibility values for the new columns; and `Client` gained seven optional billing-identity fields with a real create/edit form ("Billing details" — the only UI this slice added). **Slices 2–5 (itemized UI/lifecycle, PDF, email, contract migration/portal-visibility closure) have not started.**

**Security already implemented:** Supabase's auto-generated Data API is deliberately locked down (public-schema Postgres grants revoked) — this app does **not** use Row-Level Security policies; all authorization is application-layer, enforced through Prisma with a server-side connection. Session cookies are hardened. Rate limiting (currently in-memory/per-instance) and HTTP security headers are in place. 14 dedicated static security/invariant checks run in CI.

**What is complete:** essentially the entire feature list above, end to end (UI + Server Action + DB persistence + authorization all verified present).

**What is partial/known-incomplete (already disclosed in the repo's own README, not hidden):**
- Paddle billing is fully implemented in code but has **never been validated against a real Paddle sandbox account** — no live transaction has ever occurred.
- Custom-domain DNS verification is unimplemented — a saved domain stays "pending" forever by design.
- Invoices are still flat-amount only **in the UI a staff user actually sees** — the itemization/calculation/currency schema foundation exists (Slice 1, PR #65), but there is no itemized create/edit UI, no discount/tax/currency/issue-date form controls, no `DRAFT`-only lifecycle enforcement, no PDF export, and no send-by-email flow. That's Invoice System Slices 2–5, not started.
- Billing reconciliation and trial-ending reminder notifications don't exist yet.
- Rate limiting is per-instance/in-memory, not yet safe for a multi-instance deployment.
- No OSS license file exists for the original application code (a legal/provenance matter, not a code defect).
- A historical "save on a Settings page redirects to /login" symptom was investigated but never conclusively explained; the investigation did rule out client-side/server-wrapper `autoRefreshToken` configuration as the cause, for this project's exact `@supabase/ssr` version (it forces the relevant auth options unconditionally, regardless of what calling code passes). Whether the symptom itself still occurs on current `main` is unknown and untestable by anything in this repo's own test suite (real Supabase Auth would be required) — treat as a low-confidence, non-blocking validation item, not a confirmed bug.

**Two branches that previously sat unmerged and undecided have since been fully triaged and closed (PR #58, `91234ade4cd5f9bc6cf28531e4355640a492ea56`, then deleted):** the auth-hardening branch was closed as redundant (see above — it changed nothing `@supabase/ssr` wasn't already enforcing); the E2E-selector branch was adopted only for one test simplification (a direct `getByRole` sign-out selector), with its `data-testid` additions and settings-form changes deliberately declined. Neither branch exists anymore, locally or on `origin`. This is not an open item for you to pick up — it's included here only so you don't rediscover and re-relitigate it.

**Known problems:** no other hidden mocks, fake data, or disconnected forms were found in a full repository sweep — what looks built generally *is* built, end to end, with real database persistence and real authorization checks. The gaps above are the actual, bounded gap list, not a vague "lots of things are probably fake" concern.

**Important architectural decisions to respect:** the multi-tenant retrofit (Organization/Membership/organizationId scoping) is foundational and must never be undone; the staff/portal identity separation is intentional and structural; there is no REST API layer to "complete" — Server Actions are the real API surface; several models (`Activity.entityId`, `Notification.entityId`, `Attachment.entityId`, `Comment.entityId`) intentionally omit foreign keys so audit/history rows survive deletion of the thing they describe — don't "fix" these into real FKs.

---

**The next stage is to take this existing, substantially-complete application and systematically turn it into a fully functional, secure, production-ready SaaS** — validating what's implemented (especially real Paddle sandbox/live billing), closing the specific disclosed gaps above, and hardening what's already there for real customers. This is **not** a rebuild-from-scratch project.

**If invoicing work continues, the immediate likely next task is Invoice System Slice 2** (itemized `DRAFT` create/edit UI, server-side total recomputation/persistence on top of the already-shipped `calculateInvoiceTotals()`, `DRAFT`-only lifecycle enforcement, a read-only "Issued" view, cancel/duplicate — explicitly **not** Issue/finalize/PDF/email, which are Slices 3–4) — see `docs/invoicing-architecture.md` and Part 28. **Paddle/billing is a separate, already-implemented, deliberately deferred track** (live sandbox validation is its own gap, unrelated to and not blocking Invoice System work) — do not begin or redesign Paddle work as part of continuing the Invoice System.

You should help with: determining development priorities across the gap list above; preparing well-scoped tasks/prompts to hand to Claude Code (which has direct repository access) for implementation; reviewing Claude's resulting code/PRs at a product and architecture level; flagging bugs, security concerns, or architectural inconsistencies as they come up; making product decisions where the existing implementation leaves something ambiguous; and tracking overall progress toward production readiness. Do not propose rebuilding features from this list as if they don't exist — verify against the actual repository (or ask for a fresh inspection) before assuming something is missing that this document lists as already built.
