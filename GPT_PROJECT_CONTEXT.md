# GPT_PROJECT_CONTEXT.md — Client Portal CRM

**Purpose of this document:** a self-contained handoff so a new AI conversation (with no memory of prior development) can understand what has already been built in this repository, without re-deriving it from scratch or assuming it needs to be rebuilt.

**Investigated at:** `main` @ commit `d76cd51c54594ae0f5743b1918fbae60ac8c1126` (147 commits, 2026-07-28 → 2026-08-14, tracked working tree clean) — this is the commit the full-repository investigation below (Parts 1–26) was performed against, verified directly against source code, Prisma schema, migrations, git history, and live check runs (lint/typecheck/build/tests) at that time. This remains a historical baseline, preserved for provenance — it is **not** the current application-state baseline (see below).

**Current application-state baseline:** `main` @ commit `23142ce6e7b2e739f874511c871ed3f65a4f3ce0` (187 commits at content-update time; tracked working tree clean before this documentation task began). Thirteen application/documentation changes have landed on `main` since the original investigation:
- **PR #58** (merged as `91234ade4cd5f9bc6cf28531e4355640a492ea56`) — resolved the disposition of two previously-stale branches; one line changed in one E2E test file, no application code/schema/behavior change. See Part 2's Phase 21 and Part 24.
- **PR #59** (merged as `217dbda8734eb1bf96c505d57639dbb851837df8`) — added this file, `GPT_PROJECT_CONTEXT.md`, to the repository under version control. Documentation-only, no application-code change.
- **PR #60** (merged as `f1b4dc61d066d6a126fb4511bca0720db6637ea8`) — completed **Portal Analytics persistence** (Slice 1): `PortalUser.lastLoginAt`, the new `PortalDownloadRequest` model, and the write paths that populate them. See Part 2's new Phase 22.
- **PR #61** (merged as `a5049cba63cd906069f8c10ab4a2f30a3a47015b`) — completed **Portal Analytics read path** (Slice 2): the two new `PortalMetrics` fields, the `getPortalEngagementCounts()` query, the two scalar UI cards, and the corrected Portal empty-state predicate. See Part 2's new Phase 22.
- **PR #62** (merged as `e92e03586e9f87f02225d7520a46f06fd6ad996e`) — **documentation-only.** A prior refresh of this file after PR #61. No application-state change.
- **PR #63** (merged as `41452bd7391700f1b73063b4a8e16864d0e3de84`) — **application change.** Repaired the pre-existing `Invoice.organizationId` persistence/scoping defect: every existing Invoice row was deterministically resolved through Project/Client organization consistency (migration `20260911090000_repair_invoice_organization_scope`), `Invoice.organizationId` is now a required (`NOT NULL`) column in the Prisma schema, and the real create/update Server Actions write and maintain it on every save. The Analytics query paths that read `Invoice.organizationId` directly are no longer silently undercounted by normal application-created invoices that previously omitted it. **This migration has not been applied to any external/staging/production database by this development task** — merging into source control and a real deployment are separate, deliberately un-conflated steps. See Part 2's new Invoice System phase below.
- **PR #64** (merged as `cde602d12a0c854cded300bd91e7810cb9e089ee`) — **documentation-only.** Added `docs/invoicing-architecture.md`, the approved target-design/implementation-slice document for the full Invoice System (itemization, calculation, lifecycle, snapshot, immutable PDF archive, email/idempotency, portal visibility, and safe-migration contracts, sequenced as Slices 0–5). This PR does not itself implement any of those future slices — it is the approved plan Slice 1 (PR #65) and later slices build against.
- **PR #65** (merged as `34118012422f4434d6a183d6ca83f1a05c555101`) — **application change.** Completed **Invoice System Slice 1** — the additive schema/calculation-domain/Client-billing-identity/flat-Invoice-dual-write foundation described in `docs/invoicing-architecture.md`. See Part 2's new Invoice System phase below for the full breakdown of what shipped.
- **PR #66** (merged as `11634955358131c246ac5e1a2bf4654007deace0`) — **documentation-only.** A prior refresh of this file after PR #65 (model/enum/migration/line counts, current test totals, the Invoice feature status, and Part 11's flat-amount-only wording at that time). No application-state change.
- **PR #67** (merged as `4fee475e451d3462eb3b4c3d4df397794a6ce474`, approved head `01dd5cefa1967aef9b2fa2214a8d1d480dae1091`) — **application change.** Completed **Invoice System Slice 2a** — the client-bundle-safe calculation/currency import fix, the pure lifecycle-transition domain, and the bounded line-item form transport. No live route/action/UI behavior changed. See Part 2's Phase 23 continuation below.
- **PR #68** (merged as `b3da990400960603136dc6a6038a58041cbc3933`, approved head `1a981edfc56b9208cc5c1d217b94baeb56415b32`) — **application change.** Completed **Invoice System Slice 2b** — DRAFT flat/itemized invoice create/edit with server-authoritative calculation, page-version-guarded concurrency, a dedicated non-DRAFT lifecycle action, DRAFT-only delete, a read-only non-DRAFT presentation, and the "Issued" staff-facing label.
- **PR #69** (merged as `09beaecf8be958b956328233c4cbdc7e8f8dc725`) — **documentation-only.** A refresh/correction pass on this file after Slice 2b (PR #68), at a time when official Slice 2 was still genuinely partial (Duplicate-as-new-DRAFT had not yet shipped). No application-state change — the baseline it documented remained `b3da990400960603136dc6a6038a58041cbc3933` throughout.
- **PR #70** (merged as `23142ce6e7b2e739f874511c871ed3f65a4f3ce0`, approved final head `e9f16fb8f3464b16fe48e227711c9daae909d75f`) — **application change.** Implemented **Duplicate-as-new-DRAFT**, the one remaining piece of official Invoice System Slice 2 (`docs/invoicing-architecture.md` §3.2/§14) — completing official Slice 2. See Part 2's Phase 23 continuation and Part 11 for the full behavioral breakdown. **PR #70 is the latest application change reflected in this document.**

This document was re-swept after PR #70 to keep every affected claim accurate — model/enum/migration/line counts, current test totals, and the Invoice feature status (official Slice 1 complete; official Slice 2 complete — its Slice 2a and Slice 2b development-time subdivisions plus the Duplicate-as-new-DRAFT remainder have all shipped; official Slices 3–5 unstarted — see Part 11) are all updated below to reflect this baseline, not left as stale open items. A later, purely documentation-only commit that updates this file under version control does not by itself change the application-state baseline stated above — it remains `23142ce6e7b2e739f874511c871ed3f65a4f3ce0` until a future application change lands.

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

**Maturity assessment (evidence-based, detailed in Part 26):** this is a **functional, feature-complete MVP-to-early-SaaS-grade product**, not a prototype and not yet a fully hardened production SaaS with paying customers. It has real multi-tenant data isolation, a real (but not live-validated) payment integration, 2,332 automated tests, 14 dedicated security checks, and a clean lint/typecheck/build — but it has never processed a real transaction, never had a real customer, and carries a short, explicitly disclosed list of known gaps (custom-domain verification, Invoice Issue/finalization/PDF export/email delivery, cross-instance rate limiting, billing reconciliation). Staff can create/edit/delete flat or itemized `DRAFT` invoices, manage the seven allowed transitions among existing non-`DRAFT` legacy invoices, and duplicate a `CANCELLED` invoice into a fresh, editable `DRAFT` — all implemented end to end. Invoice work through official Slice 2 is complete: official Slice 1 shipped first as its own separate slice; **official Slice 2 was then delivered through its Slice 2a/2b development subdivisions plus the Duplicate-as-new-DRAFT remainder** — see Part 11.

---

## PART 2 — Development History (reconstructed from git log; 147 commits as of the original investigation, 2026-07-28 → 2026-08-14; 187 commits as of this update)

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
Built the test infrastructure from scratch: a security-regression skeleton, unit tests for pure-function helpers, integration tests against a real Prisma + real Server Actions (backed by an in-process PGlite Postgres), a full Playwright E2E suite (staff app, org isolation, portal, invitations, attachments, activity, security UI), and a CI audit/hardening/docs pass. This is the foundation the project's current 2,332-test suite grew from. Still exists and has been continuously extended by every subsequent phase.

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

### Phase 23 — Invoice System: organization-scope repair, approved architecture, and official Slice 2 complete (2026-08-15–08-17, PR #63–#70)

**Official Invoice System Slice 2 is now complete.** `docs/invoicing-architecture.md` defines exactly five official implementation slices (1 through 5); "2a" and "2b" are development-time subdivisions of official Slice 2, not additional entries in that count, and "Slice 2c" is only an informal development-history label for the Duplicate-as-new-DRAFT remainder — it was never introduced into `docs/invoicing-architecture.md` itself. The prerequisite repair, the approved architecture, official Slice 1, and now the whole of official Slice 2 have all shipped complete: Slice 2a and Slice 2b (PR #67/#68) gave staff a real flat/itemized `DRAFT` create/edit workflow and the seven allowed transitions among existing non-`DRAFT` legacy invoices; PR #70 then implemented Duplicate-as-new-DRAFT, the one remaining piece of official Slice 2, closing it out entirely. There is still no code path that moves `DRAFT → SENT` today — that remains official Slice 3's Issue operation, unstarted. What a reader might still expect from "Invoice System" work and does **not** yet exist: official Slice 3 (the combined Issue/finalization operation and immutable PDF generation/archival/download, which ship together, not as separate slices), official Slice 4 (invoice email send/resend and the real `InvoiceEmailAttempt` writer), and official Slice 5 (the final `NOT NULL` contract migration, the organization-wide invoice-number uniqueness constraint, the Portal DRAFT-visibility correction, and whole-feature closure). See Part 11 for the precise current-vs-target distinction and Part 28 for exactly what's left.

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
- **Superseded by PR #68 (Slice 2b, below):** `buildFlatInvoiceWriteFields()` was removed as dead code once the real create/edit Server Actions began calling `calculateInvoiceTotals()` directly; the dual-write helper's own compatibility guarantee (flat `subtotal = amount`, zeroed discount/tax) is now proven through that real call path instead.

**Slice 2a — client-bundle-safe calculation foundation, pure lifecycle domain, line-item transport (PR #67, merged as `4fee475e451d3462eb3b4c3d4df397794a6ce474`, approved head `01dd5cefa1967aef9b2fa2214a8d1d480dae1091`).** Pure-foundation slice — **no live route, Server Action, or UI behavior changed**; no schema, migration, dependency, or lockfile change. What shipped:
- `src/lib/invoices/calculations.ts`/`currencies.ts` became **permanently client-bundle-safe**: their `Prisma` import moved from the server-only `@/generated/prisma/client` (which pulls in `node:process`/`node:path`/`node:url` and fails Turbopack client bundling) to the browser-safe `@/generated/prisma/browser` entry point. Because the two generated entry points' `Decimal` classes are not the same class reference under this app's real module resolution, every `instanceof Prisma.Decimal` check was replaced with `Prisma.Decimal.isDecimal(...)` (decimal.js's own cross-instance-safe duck-typing check), so a `Decimal` constructed via either entry point is still recognized correctly.
- A new pure lifecycle domain, `src/lib/invoices/lifecycle.ts` — `ALLOWED_STATUS_TRANSITIONS` (the frozen 5×5 transition matrix), `isTransitionAllowed()`, and `computePaidAtUpdate()` (the existing 4-case `paidAt` rule, reproduced as an injectable-`now` pure function). Also defines a **type-only** `IssueInvoiceInput`/`IssueInvoiceResult` contract for the future Slice 3 Issue operation — types only, no callable function, nothing any Slice 2 code path could accidentally invoke.
- A new bounded line-item form-transport module, `src/lib/invoices/line-items-form.ts` — `encodeInvoiceLineItemsFormValue()`/`decodeInvoiceLineItemsFormValue()` for the hidden JSON field a future itemized editor submits, with a strict per-entry shape allowlist (`description`/`quantity`/`unitPrice` only, everything else discarded), the item-count ceiling imported from `MAX_LINE_ITEMS` in `calculations.ts` (never redefined as a second literal), and a raw-payload size bound of **786,432 UTF-16 code units** checked before `JSON.parse` — sized for `MAX_LINE_ITEMS` entries at `MAX_DESCRIPTION_LENGTH` each escaped at JSON's worst-case 6-code-unit-per-character rate, not just the "ordinary character" case a naive bound would assume.
- Neither new module was imported by any production route/action/component at this point — Slice 2b (below) is their first real caller.

**Slice 2b — DRAFT itemized/flat invoice create/edit, lifecycle actions, read-only view (PR #68, merged as `b3da990400960603136dc6a6038a58041cbc3933`, approved head `1a981edfc56b9208cc5c1d217b94baeb56415b32`).** The coherent core PR that makes Slice 2a's foundation live. See Part 11 for the complete, current behavioral description; summary here:
- Staff can create and edit both flat and itemized `DRAFT` invoices through a real form and real Server Actions — `InvoiceLineItem` now has a genuine production writer (create and edit both nested-write ordered line items inside the same transaction as the parent `Invoice`), and `Invoice`'s discount/tax/currency/issue-date/internal-notes fields are now real form inputs, not dual-written compatibility values.
- Totals are always server-recomputed via `calculateInvoiceTotals()` — a client-side live preview exists (importing the same, now-client-bundle-safe function directly, Slice 2a's own permanent proof of the client-bundle fix) but is never trusted for what gets persisted.
- DRAFT edits are guarded by a **page-rendered-version optimistic-concurrency scheme**: the DRAFT edit page binds `invoice.updatedAt` (read once at render) as a Server Action argument; a real, changed edit's guarded `updateMany` matches only that exact version and explicitly writes a strictly-greater `updatedAt` (`max(Date.now(), expectedUpdatedAt + 1ms)`); a true no-op performs no parent write, no line-item replacement, and no `updatedAt` bump.
- A single dedicated lifecycle Server Action (`changeInvoiceStatusAction`) governs every already-`DRAFT`-exited invoice's transitions — exactly the 7 allowed cells of the 5×5 matrix (`SENT→PAID/OVERDUE/CANCELLED`, `OVERDUE→PAID/SENT/CANCELLED`, `PAID→SENT`), runtime-validated against the real status allowlist (never trusting a Server-Action parameter's compile-time type alone). Cancel reuses this same action targeting `CANCELLED`, behind a confirmation dialog.
- Every existing non-`DRAFT` invoice now renders through a real read-only staff view (no editable frozen fields, no fabricated line item for a flat invoice, no fabricated non-null total) with the allowed lifecycle buttons for its current status; `SENT`'s staff-facing label is **"Issued"** across the list/read-only-view/lifecycle-button/Dashboard/Activity-Timeline/in-app-notification/notification-email surfaces (Portal wording is unchanged, deliberately deferred to Slice 5).
- `internalNotes` stays editable in every status (the `DRAFT` form for `DRAFT`, a dedicated inline action otherwise) and never enters Activity metadata, Portal, PDF, or email. Delete remains restricted to `DRAFT` only, with the existing transactional-guard/post-commit-Storage-cleanup discipline preserved.
- Activity: `CREATED`/`DELETED` share one enriched, null-safe structural/financial snapshot (a bare `lineItemCount`, never a line-item description/quantity/price); `UPDATED` is names-only (`changedFields`, never a value — `notes`/`internalNotes` values never enter metadata either way); `STATUS_CHANGED` keeps its existing shape and its existing `INVOICE_STATUS_CHANGED` Notification fan-out.
- **Explicitly not implemented by Slice 2b**: `DRAFT → SENT`/Issue, finalization, `issuerSnapshot`/`recipientSnapshot` writes, PDF generation/archive/download, invoice email send/resend, any `InvoiceEmailAttempt` writer, Duplicate-as-new-DRAFT, the Portal DRAFT-visibility correction, the Slice 5 `NOT NULL` contract migration, and no schema/migration/dependency/lockfile change of any kind.
- Shipped across three commits on one PR — the coherent core implementation, a narrow correction pass (strictly-monotonic edit versioning, strict `"flat"`/`"itemized"` mode validation, UTC-pinned date-only display), and one comment-only factual correction — all three squashed into no single commit; the merge is a regular two-parent merge commit, `4fee475e451d3462eb3b4c3d4df397794a6ce474` (base) + `1a981edfc56b9208cc5c1d217b94baeb56415b32` (approved head).

**Duplicate-as-new-DRAFT — the remainder of official Slice 2 (PR #70, merged as `23142ce6e7b2e739f874511c871ed3f65a4f3ce0`, approved final head `e9f16fb8f3464b16fe48e227711c9daae909d75f`, initial implementation head `7b829f9ac53bc36989b3e270ff9f40ad5d3206ef`).** Completes official Invoice System Slice 2 exactly as originally scoped in `docs/invoicing-architecture.md` §3.2/§14 ("Cancel + Duplicate-as-new-DRAFT" as the v1 correction mechanism). What shipped:
- A dedicated route, `src/app/(dashboard)/invoices/[id]/duplicate/page.tsx`. Only an authorized, organization-scoped, exactly-`CANCELLED` source invoice is eligible — `DRAFT`, `SENT`, `PAID`, `OVERDUE`, a cross-organization id, and a nonexistent id all resolve through the same `notFound()` outcome, structurally indistinguishable from one another.
- The source loader, `src/lib/invoices/duplicate-source.ts` (`getDuplicateSourceInvoice()`), uses an explicit, minimal Prisma `select` — never `include` — and its result type (`DuplicateSourceInvoice`) is inferred directly from that same `select` object via `Prisma.InvoiceGetPayload`, so the query and its type can never drift apart.
- The `CANCELLED` read-only view (`InvoiceLifecycleControls`) exposes a "Duplicate as new draft" link, visible only for that one status. **Opening the duplicate page writes nothing** — it is a pure, scoped read.
- The invoice-number suggestion is exactly `` `${original.trim()}-R1` `` (`src/lib/invoices/duplicate.ts`, `suggestDuplicateInvoiceNumber()`) — no existing `-R<n>` suffix is detected or incremented, no database lookup for the "next free" number, no reservation, and it is never auto-submitted; staff must explicitly review/edit it and submit.
- Source `currency` is canonicalized (`trim().toUpperCase()`) once at the page boundary — never a denomination conversion. A supported canonical currency is copied unchanged into the new draft. An authorized `CANCELLED` source with an **unsupported** currency renders a disclosed 200 blocked state — no `InvoiceForm` is constructed, no submit control exists, and there is never a silent USD fallback.
- The pure mapper, `buildDuplicateInvoiceDefaults(source, today)`, takes an **injected** `today: Date` (never an internal `new Date()` call) — a flat source copies `amount`; an itemized source copies ordered `description`/`quantity`/`unitPrice` per line and uses `amount: ""` (never a dormant copy of the source's aggregate total); `issueDate` always resets to `today`; `dueDate` and `internalNotes` always reset blank; `notes` and the discount/tax inputs are copied unchanged.
- Submission goes through the **ordinary, completely unmodified** `createInvoiceAction` — no `sourceInvoiceId` or any other source-identity field is ever added to the submitted `FormData`. The resulting invoice is an ordinary fresh `DRAFT` with `paidAt: null`: Project ownership is reverified, `clientId`/`organizationId` are re-derived server-side, every total and line-item `lineTotal` is recomputed server-side, and every line-item `id`/`position` is newly assigned — never copied from the source. The source invoice and its own Activity history are left completely unchanged; no schema, migration, `sourceInvoiceId`/revision relation, dependency, lockfile, Portal, Paddle, or architecture-doc change was made. No attachments, `InvoiceEmailAttempt` rows, finalization fields, snapshots, or PDF state are ever copied. A successful duplicate produces exactly the ordinary `INVOICE`/`CREATED` Activity row, identical in shape to any other new-invoice creation.
- Two commits: the initial implementation (`7b829f9`) and a follow-up test-evidence-strengthening commit (`e9f16fb8f3464b16fe48e227711c9daae909d75f`) that added no new production code and no net new test count — it replaced under-specified integration/E2E assertions with exact-scope zero-write and source-immutability proofs. See Part 21 for full verification provenance.
- **Official Invoice System Slice 2 is complete as of this PR.** See Part 28 for the full remaining-gap list (official Slices 3–5).

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
| `Invoice` | A billing document for a `Client`/`Project` | status lifecycle (Draft/Sent("Issued")/Paid/Overdue/Cancelled), `paidAt`; `organizationId` is a required, `NOT NULL` tenant-scoping column as of PR #63 (previously nullable, silently unwritten by production code); since Slice 1 (PR #65) carries additive fields for `internalNotes`, discount/tax, calculated totals, and finalization/archive — as of Slice 2b (PR #68) `internalNotes`/discount/tax/currency/issue-date are real, form-driven, staff-written fields, and calculated totals (`subtotal`/`discountAmount`/`taxAmount`) are written by the real DRAFT create/edit path though the columns themselves remain nullable at the schema level until Slice 5's contract migration; finalization/archive fields (`finalizedAt`/`issuerSnapshot`/`recipientSnapshot`/`pdfStoragePath`/`pdfGeneratedAt`) remain unwritten/`NULL` — see Part 11 |
| `InvoiceLineItem` | **New in PR #65 (Slice 1); real production writer since Slice 2b (PR #68), unchanged by PR #70's Duplicate-as-new-DRAFT** (Duplicate creates an ordinary new `InvoiceLineItem` set through the same existing writer, never a copy/reference of the source's rows). A single itemized line (description, quantity, unit price, line total, position) belonging to an itemized Invoice | belongs to one `Invoice`, cascades on delete; DRAFT create/edit nested-writes ordered rows inside the same transaction as the parent `Invoice`; position is always server-assigned and contiguous — see Part 11 |
| `InvoiceEmailAttempt` | **New in PR #65 (Slice 1) — remains schema-reserved only; still no production writer as of PR #70.** A single Invoice send/resend attempt and its provider-acceptance state | belongs to one `Invoice`, cascades on delete; optional actor `User`; see Part 11 |
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

Route: `(dashboard)/invoices/`. Organization-scoped, `src/lib/validation/invoice.ts`. **Official Invoice System Slice 2 is complete (PR #63–#70).** Staff can create, edit, and delete flat or itemized `DRAFT` invoices; manage the seven allowed transitions among existing non-`DRAFT` legacy invoices; Cancel a `SENT`/`OVERDUE` invoice; and duplicate a `CANCELLED` invoice into a fresh, editable `DRAFT` via `/invoices/[id]/duplicate` — this is a complete correction/creation workflow, but it is **not** a complete lifecycle from `DRAFT` creation through Issue. There is still no code path that moves `DRAFT → SENT` today — that is official Slice 3's Issue/finalization operation, unstarted. Read this section together with Part 2's Phase 23 and `docs/invoicing-architecture.md` for the full target design and what's still ahead (Issue/finalization, PDF, email — see Part 28).

**Create/edit (`DRAFT` only):**
- Current form/action fields (`InvoiceForm` + `parseInvoiceForm()`): `invoiceNumber` (unique per client), `projectId`/Project selection, `mode` (`"flat"` or exactly `"itemized"` — any other value, including missing/empty/mis-cased/forged, is rejected with `fieldErrors.mode` before authentication or any DB access), `amount` (flat mode) or a hidden-JSON `lineItems` field (itemized mode, decoded via `decodeInvoiceLineItemsFormValue()`), `currency`, `issueDate` (required, strict `YYYY-MM-DD`), `dueDate` (optional), `discountType`/`discountValue`, `taxRatePercent`/`taxLabel`, `notes`, `internalNotes`. **`status` is never a submitted field on this form** — verified directly against `src/components/invoices/invoice-form.tsx` and `src/lib/validation/invoice.ts`.
- Create always forces `status: "DRAFT"` and `paidAt: null`, regardless of any legacy client-side assumption; direct creation in any other status is not possible through this form/action.
- Every total (`amount`/`subtotal`/`discountAmount`/`taxAmount`) is recomputed server-side via `calculateInvoiceTotals()` on every create/edit — a client-side live preview exists (a real, permanently-live Client Component import of the same client-bundle-safe function Slice 2a fixed) but is never trusted as the persisted value.
- `InvoiceLineItem` now has a real production writer: itemized create/edit nested-writes ordered rows (contiguous, server-assigned `position`, never trusted from client input) inside the same transaction as the parent `Invoice`; switching flat↔itemized on an edit correctly removes/recreates the row set.
- `clientId`/`organizationId` remain derived from the verified `Project` on every write, never trusted from form input (unchanged discipline from before Slice 2b).
- DRAFT edits use a **page-rendered-version optimistic-concurrency guard**: the DRAFT edit page binds `invoice.updatedAt` (read once at render) as a Server Action argument (`expectedUpdatedAt`), never re-read fresh inside the action; a real, changed edit's guarded `updateMany` matches only that exact `(id, organizationId, status: "DRAFT", updatedAt: expectedUpdatedAt)` tuple and explicitly writes a strictly-greater `updatedAt` (`max(Date.now(), expectedUpdatedAt + 1ms)` — not relying on Prisma's implicit `@updatedAt` alone, which is only millisecond-granular); a true no-op (identical resubmitted values) performs no parent write, no line-item replacement, no `updatedAt` bump, and writes no `UPDATED` Activity.
- `issueDate`/`dueDate` parse through a strict, pure `parseDateOnly()` (`src/lib/invoices/date-only.ts`) — exact `YYYY-MM-DD` only, years `0001`–`9999` (year `0000` and impossible calendar dates rejected), UTC-anchored via `setUTCFullYear` (not `Date.UTC`, which offsets two-digit-looking years). Staff `issueDate`/`dueDate` **display** (the read-only Invoice view and the Invoice list's due-date column) uses a paired `formatDateOnlyForDisplay()` helper that explicitly pins `timeZone: "UTC"`, so a negative-UTC-offset server/runtime can never render the previous calendar day. **`paidAt`/`createdAt` are real timestamps, not date-only values, and their pre-existing local-time formatting is unchanged by this — they are deliberately outside this correction's scope.**

**Lifecycle (existing non-`DRAFT`/legacy invoices):**
- Every existing non-`DRAFT` invoice renders through a real read-only staff view (same route, branched by status) — no editable frozen field, no Delete control, no fabricated line item for a flat invoice, no fabricated non-null total for a legacy row with still-nullable `subtotal`/`discountAmount`/`taxAmount`.
- One dedicated lifecycle Server Action (`changeInvoiceStatusAction`) governs every transition for an already-non-`DRAFT` invoice, using the exact 7-of-25 allowed cells of the 5×5 matrix: `SENT→PAID`, `SENT→OVERDUE`, `SENT→CANCELLED`, `OVERDUE→PAID`, `OVERDUE→SENT`, `OVERDUE→CANCELLED`, `PAID→SENT`. The other 18 cells (including every same-state cell) are forbidden; `DRAFT` has no outbound transition through this action at all (it exits only via the create/edit form or delete). The action's target-status parameter is validated at runtime against the real status allowlist — never trusting a Server Action parameter's compile-time type alone — before any DB access. `CANCELLED` is terminal.
- `SENT`'s **staff-facing label is "Issued"** — applied consistently across the Invoice list badge/filter, the read-only view, lifecycle-button copy, the Dashboard's recent-invoices badge and invoice-status breakdown, the Activity Timeline's `STATUS_CHANGED` detail line, and the in-app Notification Center/notification-email formatting for `INVOICE_STATUS_CHANGED`. **Portal invoice-status wording is deliberately unchanged** (still reads "Sent") — a disclosed Slice 5 boundary, not an oversight. **"Issued" does not mean the invoice was ever actually emailed, or that a PDF/finalized archive exists** — no Send/email operation and no PDF/finalization exist yet (Slices 3–4, unstarted); every current non-`DRAFT` invoice is, and remains, an unarchived legacy record under `docs/invoicing-architecture.md` §4.6's own classification.
- `DRAFT → SENT` (the actual Issue/finalization operation) **is not implemented in Slice 2b** — it belongs to Slice 3, unstarted; there is no code path anywhere that can move a `DRAFT` invoice out of `DRAFT` today.
- Cancel is the same guarded lifecycle action targeting `CANCELLED`, shown only for `SENT`/`OVERDUE`, behind a confirmation dialog — not a separate business implementation.
- `paidAt` still follows the exact 4-case rule (stamp fresh on non-PAID→PAID, clear on PAID→non-PAID, omit/no-op otherwise), now computed by the shared, injectable-`now` `computePaidAtUpdate()` (Slice 2a) and invoked from the lifecycle action.
- `internalNotes` stays editable in every status — through the main `DRAFT` edit form for `DRAFT`, a dedicated inline Server Action for every other status — and remains staff-only (never rendered to the client/PDF/email, never a value in any Activity metadata).
- Delete remains restricted to `DRAFT` only (a guarded, transactional `status: "DRAFT"` predicate on both the lookup and the delete); a non-`DRAFT` invoice can never be deleted, and the existing DELETED-Activity/Attachment-DB-cleanup/post-commit-Storage-cleanup ordering is unchanged — zero Storage calls when the guard fails.
- The Invoice list now shows **Edit + Delete for `DRAFT` rows** and **View-only, no Delete, for every non-`DRAFT` row** — both link to the same per-invoice route, which branches by status.

**Activity/privacy:**
- `CREATED`/`DELETED` share one enriched, null-safe structural/financial snapshot (`invoiceNumber`/`status`/`amount`/`currency`/`subtotal`/`discountType`/`discountAmount`/`taxRatePercent`/`taxAmount`/`taxLabel`/a bare `lineItemCount`) — never a line-item description/quantity/unit-price value, never `notes`/`internalNotes`.
- `UPDATED` is names-only — `changedFields` (e.g. `["currency", "lineItems", "internalNotes"]`), never a before/after value for any field, including `amount`.
- `STATUS_CHANGED` keeps its existing shape (`invoiceNumber`/`projectName`/`from`/`to`/`actorName`) and its existing `INVOICE_STATUS_CHANGED` Notification fan-out (every OWNER/ADMIN in the org, actor excluded) — unchanged, still the only Invoice Activity action that ever notifies anyone. Notification email delivery remains post-commit, best-effort, using already-committed Notification ids.

**Duplicate-as-new-DRAFT (`CANCELLED`-only, PR #70, completing official Slice 2):**
- Eligibility is exact: only an authorized, organization-scoped, exactly-`CANCELLED` invoice exposes the "Duplicate as new draft" link (`InvoiceLifecycleControls`, the read-only view) and resolves the dedicated route, `/invoices/[id]/duplicate`. `DRAFT`, `SENT`, `PAID`, `OVERDUE`, a cross-organization id, and a nonexistent id all resolve through the same `notFound()` — structurally indistinguishable.
- The source loader (`src/lib/invoices/duplicate-source.ts`, `getDuplicateSourceInvoice()`) uses an explicit, minimal Prisma `select` — never `include` — and its result type is inferred from that `select` via `Prisma.InvoiceGetPayload`, so the query and its type can never drift apart. **Opening the page performs zero writes.**
- The invoice-number suggestion is exactly `` `${original.trim()}-R1` `` (`suggestDuplicateInvoiceNumber()`, `src/lib/invoices/duplicate.ts`) — no existing `-R<n>` suffix is detected/incremented, no database lookup, no reservation, and it is **never auto-submitted**: staff must explicitly review, optionally edit, and submit.
- Source `currency` is canonicalized (`trim().toUpperCase()`) once, at the page boundary. A supported canonical currency is copied unchanged into the new draft as its actual denomination. An authorized `CANCELLED` source whose currency is **unsupported** renders a disclosed 200 blocked state instead — no `InvoiceForm`, no submit control, no silent USD substitution.
- The pure mapper (`buildDuplicateInvoiceDefaults(source, today)`) takes an **injected** `today` — never an internal `new Date()`. A flat source copies `amount`; an itemized source copies ordered `description`/`quantity`/`unitPrice` per line and sets `amount: ""` (never a dormant copy of the source's own aggregate total). `issueDate` always resets to `today`; `dueDate` and `internalNotes` always reset blank; `notes` and every discount/tax input are copied unchanged.
- Submission goes through the **ordinary, unmodified `createInvoiceAction`** — the exact same action `/invoices/new` uses. No `sourceInvoiceId` or any other source-identity value is ever added to the submitted form. **The created invoice is an ordinary new `Invoice` row — Duplicate creates no database relation to its source.** Project ownership is reverified server-side; `clientId`/`organizationId` are re-derived from the verified Project; every total and every line-item `lineTotal` is recomputed server-side; every line-item `id`/`position` is freshly assigned. The new invoice is always `DRAFT` with `paidAt: null`.
- The source invoice itself — and its own Activity history — are left completely unchanged by opening the page or by a successful duplicate submission. No attachments, `InvoiceEmailAttempt` rows, finalization fields, snapshots, or PDF state are ever copied from source to duplicate. A successful duplicate produces exactly one ordinary `INVOICE`/`CREATED` Activity row for the *new* invoice, identical in shape to any other invoice creation — nothing references the source id.
- No schema, migration, dependency, lockfile, Portal, Paddle, or architecture-doc change was made to ship this.

**Compatibility, unchanged:**
- `amount` remains the sole canonical total every Dashboard/Analytics/Search/Portal read consumes.
- A flat invoice is still exactly `lineItems.length === 0` — no new discriminator column, no fabricated row ever created for a flat invoice.
- `organizationId` remains the required, schema-enforced (`NOT NULL`) primary tenant predicate on every Invoice query (`project.organizationId` retained as defense-in-depth) — unchanged since PR #63.
- The invoice-numbering uniqueness constraint remains `@@unique([clientId, invoiceNumber])` — the target, organization-wide `[organizationId, invoiceNumber]` constraint (`docs/invoicing-architecture.md` §4.5) remains explicitly deferred to official Slice 5, unchanged by Slice 2a/2b or by PR #70.
- No schema, migration, dependency, or lockfile change landed in PR #67, #68, or #70.
- Client Portal visibility: unchanged by Slice 2a/2b/Duplicate — a connected `PortalUser` can still see (read-only) the invoices belonging to their own Client, with an All/Open/Paid filter. The still-open `DRAFT`-visibility leak flagged in `docs/invoicing-architecture.md` §1.3 (a `DRAFT` invoice is reachable by a portal identity today) remains unfixed — that correction is still official Slice 5's.

**Still explicitly not implemented:** the actual finalization/Issue operation (`DRAFT → SENT`) or any `issuerSnapshot`/`recipientSnapshot` write; PDF generation, archival, or download routes (these ship together with Issue as official Slice 3, not as separate slices); a send-by-email flow or any `InvoiceEmailAttempt` writer (official Slice 4); payment-processing/collection (status is still set manually by staff — there is no "pay this invoice" button anywhere for a client); the Portal DRAFT-visibility fix; the final `NOT NULL` contract migration on `subtotal`/`discountAmount`/`taxAmount`; the organization-wide invoice-numbering constraint (official Slice 5). Duplicate-as-new-DRAFT is **no longer** on this list — it shipped in PR #70. Verified directly against the schema and a source-code grep for any Issue/Send/PDF/`InvoiceEmailAttempt`-writer implementation — not an assumption.

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
- A comprehensive automated test suite (2,332 tests, current baseline — see Part 21) including dedicated authorization/tenant-isolation integration tests (`test/integration/authorization/`, `test/integration/security/`) and E2E security-UI specs (redirect-safety, XSS-as-literal-text rendering).

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

### Historical verification (Portal Analytics Slice 1 + Slice 2, PR #60–#61) — superseded, see "Current verification (Invoice System official Slice 2 complete, PR #70)" below for current totals

The figures above are frozen at `d76cd51`/PR #58 and preserved for provenance. The following were the up-to-date totals as of PR #60–#61 (Portal Analytics completion) — **preserved for provenance; no longer current.** See "Current verification (Invoice System official Slice 2 complete, PR #70)" below for the current, up-to-date totals:

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

### Historical verification (Invoice System Slice 1, PR #65) — superseded, see "Current verification (Invoice System official Slice 2 complete, PR #70)" below for current totals

The figures below were the up-to-date totals as of PR #65 — **preserved for provenance; no longer current.** See "Current verification (Invoice System official Slice 2 complete, PR #70)" below for the current, up-to-date totals:

| Check | Result |
|---|---|
| Unit tests | 1,211 passed |
| Integration tests | 551 passed |
| E2E tests | 282 passed |
| Total automated tests | 2,044 passed |
| Security checks | 14/14 passed |
| Lint | Clean |
| TypeScript | Clean |
| Production build | Succeeded |

**Provenance:** this full command suite passed on the exact approved PR #65 head, `78f09ae20d583ff60aa8447db0db0e59cc9bd60c` — the same commit GitHub CI independently validated before the PR was allowed to merge (`fast-checks` pass; `integration` pass — the full Vitest integration suite plus the full Playwright E2E suite against a real production build; both Vercel checks pass). The PR #65 merge commit, `34118012422f4434d6a183d6ca83f1a05c555101`, is a regular two-parent merge (`--merge`, no squash/rebase) whose second parent is that exact validated head — it introduces no content change beyond what CI already validated, so the full suite was intentionally **not** rerun a second time after the merge commit itself. Since the historical PR #61 baseline (1,086 unit / 527 integration, 1,895 total), the suite grew by **125 unit and 24 integration tests** (2,044 − 1,895 = 149 total) across **both** PR #63 and PR #65 — not entirely PR #65. Attributed directly by running each added/changed test file in isolation against its introducing commit: **PR #63** added `test/unit/invoice-organization-migration-contract.test.ts` (12 unit) and `test/integration/invoices/organization-scope.test.ts` (12 integration) for the Invoice organization-scope repair — its other two changed integration files (`cross-org.test.ts`, `portal/authorization.test.ts`) were edited for accuracy/new call signatures with no net test-count change. **PR #65** added `test/unit/{invoice-calculations,invoice-currencies,invoice-slice1-migration-contract,client-validation}.test.ts` (41 + 37 + 16 + 18 = 112 unit) plus one new test in the existing `activity-metadata.test.ts` (24 → 25, +1 unit) for a total of 113 unit, and `test/integration/{invoices/slice1-flat-dual-write,clients/billing-identity}.test.ts` (5 + 7 = 12 integration). Sum: 12 + 113 = **125 unit** (matches 1,211 − 1,086 exactly); 12 + 12 = **24 integration** (matches 551 − 527 exactly). The E2E count (282) is unchanged — Slice 1 added no *new dedicated* E2E test, though it did add real, browser-testable user-facing behavior (the Client "Billing details" form section); that behavior received dedicated integration coverage instead (see above), and existing E2E coverage continued to pass. Separately, PR #65 minimally disambiguated **7 existing locator call sites, across 6 existing E2E tests, in exactly 5 spec files** (`activity.spec.ts`, `billing-enforcement.spec.ts`, `first-value-moment.spec.ts` [2 call sites, 2 tests], `security-ui.spec.ts`, `staff-app.spec.ts` [2 call sites, 1 test]) — each replaced an ambiguous substring-matched `page.getByLabel("Name")` with an exact accessible-name `page.getByRole("textbox", { name: "Name", exact: true })`, after the new "Billing legal name" field made the substring match resolve to two elements.

### Historical verification (Invoice System Slice 2b, PR #68) — superseded, see Invoice System official Slice 2, PR #70 below for current totals

The figures below were the up-to-date totals as of PR #68 — **preserved for provenance; no longer current.** See "Current verification (Invoice System official Slice 2 complete, PR #70)" immediately below for the current, up-to-date totals:

| Check | Result |
|---|---|
| Unit tests | 1,359 passed |
| Integration tests | 634 passed |
| E2E tests | 294 passed |
| Total automated tests | 2,287 passed |
| Security checks | 14/14 passed |
| Lint | Clean |
| TypeScript | Clean |
| Production build | Succeeded |

**Provenance:** full executable verification — the complete local command suite above (lint, typecheck, production build, the full unit/integration/E2E suites, and all 14 security checks) — passed on commit `609851ed5945502f163785bde12edf71ff0d562c`, the correction-pass commit within PR #68 (strictly-monotonic edit versioning, strict `"flat"`/`"itemized"` mode validation, UTC-pinned date-only display). The PR's final approved head, `1a981edfc56b9208cc5c1d217b94baeb56415b32`, differs from `609851e` by exactly one further commit containing a factual source-code doc-comment correction in `src/lib/invoices/date-only.ts` (fixing an inaccurate claim about `paidAt`/`createdAt`'s timezone semantics) — no executable logic changed in that commit. On `1a981ed` itself, local verification was narrower and targeted, not a full suite re-run: `git diff --check` (clean), `npm run lint` (clean), `npx tsc --noEmit` (clean), and a scoped `npx vitest run test/unit/invoice-date-only.test.ts` (**12/12 passed**). Separately, **GitHub CI ran its full configured gates on the exact final head, `1a981ed`**: `fast-checks` (pass), `integration` (pass — the full Vitest integration suite plus the full Playwright E2E suite against a real production build), and both `Vercel`/`Vercel Preview Comments` checks (pass) — independently confirming the exact final head, including its one-comment change, before merge was permitted. `main`'s merge commit for PR #68, `b3da990400960603136dc6a6038a58041cbc3933`, is a regular two-parent merge (`--merge`, no squash/rebase) whose second parent is `1a981ed`. Relative to the PR #65/Slice 1 baseline (1,211 unit / 551 integration / 282 E2E), the suite grew by **148 unit, 83 integration, and 12 E2E tests** (2,287 − 2,044 = 243 total) across **both** PR #67 and PR #68 — **PR #67 (Slice 2a)** added 64 unit tests only; **PR #68 (Slice 2b)** added the remaining 84 unit, 83 integration, and 12 E2E tests.

### Current verification (Invoice System official Slice 2 complete, PR #70)

The following are the **current, up-to-date totals** — this is what any current-tense test-count claim elsewhere in this document now means:

| Check | Result |
|---|---|
| Unit tests | **1,382 passed** |
| Integration tests | **651 passed** |
| E2E tests | **299 passed** |
| **Total automated tests** | **2,332 passed** |
| Security checks | **14/14 passed** |
| Lint | Clean |
| TypeScript | Clean |
| Production build | Succeeded |

**Provenance — two heads, precisely attributed, never conflated:**

**Initial implementation head, `7b829f9ac53bc36989b3e270ff9f40ad5d3206ef`.** Full local verification was run directly against this exact commit: lint clean; `npx tsc --noEmit` clean; the full unit suite, **1,382/1,382 passed**; the full integration suite, **651/651 passed**; `npm run security:check`, **14/14 passed**; `npm run build` succeeded; the full Playwright E2E suite, **299/299 passed**; `git diff --check` clean.

**Final approved head, `e9f16fb8f3464b16fe48e227711c9daae909d75f`.** This differs from `7b829f9` by exactly one further commit that touched only two test files — `test/integration/invoices/duplicate.test.ts` and `test/e2e/invoices.spec.ts` — strengthening under-specified zero-write/source-immutability assertions into exact-scope proofs (no production code changed, no net new test count). On `e9f16fb` itself, local verification was targeted, not a blind full re-run of everything already proven on `7b829f9`: the focused duplicate-invoice integration suite, **17/17 passed**; the focused `test/e2e/invoices.spec.ts` file, **17/17 passed**; `npm run lint` clean; `npx tsc --noEmit` clean; the **full** integration suite, **651/651 passed**; the **full** Playwright E2E suite, **299/299 passed**; `git diff --check` clean. The full local unit/security/build suite was **not** blindly rerun a second time on `e9f16fb` — it was already proven on `7b829f9`, and the only intervening change was test-only.

**CI on the exact final head, `e9f16fb`** — per this repository's own workflow definitions (`.github/workflows/ci-fast.yml`, `ci-integration.yml`): **`fast-checks`** ran `prisma validate`, a full production `next build`, `npx tsc --noEmit`, `npm run lint`, `npm run security:check`, and the full unit suite with coverage; **`integration`** ran the full Vitest integration suite (real Prisma against an in-process PGlite Postgres), then a separate full production `next build`, then the full Playwright E2E suite (real Chromium against that `next start` build, `TEST_MODE` identity injection); **`Vercel`** and **`Vercel Preview Comments`** are the platform's own preview-deployment build and PR-comment bot. All four required checks passed on the exact final head `e9f16fb` before merge was permitted.

`main`'s merge commit for PR #70, `23142ce6e7b2e739f874511c871ed3f65a4f3ce0`, is a regular two-parent merge (`--merge`, no squash/rebase) whose second parent is `e9f16fb` — it introduces no content change beyond what CI had already validated on that exact head, so the full suite was intentionally **not** rerun again after the merge commit itself.

**Attribution, relative to the PR #68/Slice 2b baseline immediately above** (1,359 unit / 634 integration / 294 E2E, 2,287 total): the suite grew by **+23 unit, +17 integration, and +5 E2E tests** (1,382 − 1,359 = 23; 651 − 634 = 17; 299 − 294 = 5; 2,332 − 2,287 = 45 total), entirely from **PR #70**. `test/unit/invoice-duplicate.test.ts` added 23 unit tests (`suggestDuplicateInvoiceNumber()`/`buildDuplicateInvoiceDefaults()`); `test/integration/invoices/duplicate.test.ts` added 17 integration tests (loader eligibility/isolation, zero-write proof, real-action tampering/immutability proof, collision handling); `test/e2e/invoices.spec.ts` added 5 E2E tests (full itemized flow, negative route eligibility, legacy-flat source, currency normalization/blocked-state, keyboard/responsive). The second, test-evidence-strengthening commit (`e9f16fb`) added no further net test count — it rewrote existing new-test assertions in place.

**CI/CD:** two GitHub Actions workflows (`.github/workflows/ci-fast.yml`, `ci-integration.yml`) — a fast lint/typecheck/unit pass and a full integration+E2E pass (real Postgres, real Playwright browser, real production build) gate every PR.

---

## PART 22 — Features That Look Complete vs. Actually Complete

| Feature | UI | Backend | DB persistence | Authorization | End-to-end functional | Status |
|---|---|---|---|---|---|---|
| Clients CRUD | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Projects CRUD | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Tasks CRUD | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Invoice organization scoping (`organizationId`) | n/a | ✅ | ✅ | ✅ | ✅ | **REPAIRED AND COMPLETE** (PR #63 — was silently unwritten by production code before; see Part 2 Phase 23) |
| Invoice calculation/compatibility foundation (`calculateInvoiceTotals()`, currency contract, flat-invoice dual-write, Client billing identity) | Client-billing UI only | ✅ | ✅ | ✅ | n/a (no new Invoice-facing workflow) | **SLICE 1 COMPLETE** (PR #65) |
| Invoice lifecycle-transition/line-item-form pure foundation (`ALLOWED_STATUS_TRANSITIONS`, `isTransitionAllowed()`, `computePaidAtUpdate()`, line-item encode/decode) | n/a | ✅ (pure functions only) | n/a | n/a | n/a (no live route/UI wired) | **SLICE 2A COMPLETE** (PR #67) — foundation only, not wired to any UI |
| Invoice flat + itemized `DRAFT` create/edit (mode-strict form, server-recomputed totals, real `InvoiceLineItem` writer) | ✅ | ✅ | ✅ | ✅ | ✅ | **SLICE 2B COMPLETE** (PR #68) |
| Invoice non-`DRAFT` read-only view + 7-cell lifecycle-transition enforcement + "Issued" labeling | ✅ | ✅ | ✅ | ✅ | ✅ | **SLICE 2B COMPLETE** (PR #68) |
| Invoice Cancel | ✅ | ✅ | ✅ | ✅ | ✅ | **SLICE 2B COMPLETE** (PR #68) — reuses the same guarded lifecycle action |
| `InvoiceLineItem` production write path | ✅ (itemized create/edit) | ✅ | ✅ | ✅ | ✅ | **IMPLEMENTED** (Slice 2b, PR #68) |
| `InvoiceEmailAttempt` production write path | ❌ | ❌ | ❌ — schema exists (table is migrated), but no Server Action/route ever writes a row | — | ❌ | **NOT IMPLEMENTED** (schema-reserved only; Slice 4 eventually writes this) |
| Duplicate-as-new-DRAFT | ✅ | ✅ | ✅ (an ordinary new `DRAFT` Invoice/InvoiceLineItem set through the existing create action — no source-link persistence) | ✅ | ✅ | **OFFICIAL SLICE 2 COMPLETE** (PR #70) |
| Invoice Issue/finalization (`DRAFT → SENT`, issuer/recipient snapshots) | ❌ | ❌ | ❌ | — | ❌ | **NOT IMPLEMENTED** (Slice 3, unstarted) |
| Invoice PDF archive/export | ❌ | ❌ | — | — | ❌ | **NOT IMPLEMENTED** (Slice 3, unstarted — ships together with Issue/finalization as one slice) |
| Invoice email delivery (send/resend) | ❌ | ❌ | — | — | ❌ | **NOT IMPLEMENTED** (Slice 4, unstarted) |
| Portal DRAFT-visibility fix / Slice 5 `NOT NULL` contract migration | ❌ | ❌ | ❌ | — | ❌ | **NOT IMPLEMENTED** (Slice 5, unstarted) |
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
- **No invoice-facing PDF export, no invoice email delivery** — an active, in-progress multi-slice effort (official Invoice System Slices 3–5, see Part 2's Phase 23 and Part 28), not an abandoned gap: official Slice 2 (real staff-facing itemized/flat `DRAFT` create/edit, server-side total recomputation, non-`DRAFT` lifecycle enforcement, and Duplicate-as-new-DRAFT) is complete (PR #63–#70), but Issue/finalization, PDF, email, and the Portal DRAFT-visibility fix do not exist yet.
- **Rate limiting is per-instance/in-memory** — correct for today's likely single-instance deployment, but will silently under-enforce limits the moment the app runs on more than one server instance.
- **No public OSS license file** — a legal/provenance gap, not a code gap (see the S2 sale-package work referenced in git history/session context for full disclosure language).
- **`.env`, `.env.local`, `.env.production.local`, `.env.test` all exist as real (git-ignored) files locally** — normal for local development, but worth flagging that this repository, as currently checked out on this machine, has real local environment configuration present; nothing in this investigation read or disclosed their contents.

---

## PART 25 — "WHAT HAS ALREADY BEEN BUILT" (human-readable summary)

Client Portal CRM is a genuinely complete, working multi-tenant SaaS application — not a landing page with a database table behind it, and not a single-tenant CRUD demo with tenancy bolted on as an afterthought.

**The core CRM** — Clients, Projects, Tasks, Invoices — is fully built: real create/edit/delete flows, real search/filter/sort/pagination, real status lifecycles, real relationships between entities, all scoped correctly to whichever Organization the current user is acting as.

**An Invoice System upgrade is in progress, one official slice at a time — and official Slice 2 is now complete: staff can create, edit, and delete both flat and itemized `DRAFT` invoices, manage the seven allowed transitions among existing non-`DRAFT` legacy invoices, and duplicate a `CANCELLED` invoice into a fresh, editable `DRAFT`.** `Invoice.organizationId` (the tenant-scoping column) was repaired from a silent, previously-unwritten defect to a required, correctly-written column (PR #63); a full target architecture for itemization/lifecycle/PDF/email was approved and documented (PR #64, `docs/invoicing-architecture.md`); Slice 1 shipped the additive schema (`InvoiceLineItem`, `InvoiceEmailAttempt`, discount/tax/calculated-total columns), a pure Decimal calculation engine, a bounded invoice-currency contract, and real optional Client billing-identity fields (PR #65); Slice 2a made the calculation/currency code permanently client-bundle-safe and added a pure lifecycle-transition/line-item-form foundation with no live wiring (PR #67); Slice 2b wired all of it into a real, live staff workflow (PR #68) — a mode-strict flat-or-itemized `DRAFT` create/edit form with server-recomputed totals, a real `InvoiceLineItem` writer, page-version optimistic-concurrency-guarded edits, a read-only non-`DRAFT` view with a 7-cell lifecycle-transition matrix and an "Issued" label for `SENT`, and a Cancel action; and PR #70 shipped Duplicate-as-new-DRAFT — a `CANCELLED`-only, zero-write-to-open, literal-`-R1`-suggestion correction flow through the same ordinary `createInvoiceAction` — closing out official Slice 2 entirely. What still doesn't exist: the combined Issue/finalization operation and PDF archival that make up official Slice 3, the email delivery of official Slice 4, and official Slice 5's contract migration/Portal-visibility closure — none of these have started.

**Multi-tenancy is real, not cosmetic.** Every business table carries an `organizationId`; every query is scoped server-side from a verified session, never from anything the client could tamper with; an organization switcher lets a user move between multiple workspaces they belong to; roles (Owner/Admin/Member) are enforced in the Server Actions themselves, not just hidden in the UI.

**The Client Portal is the standout feature.** It is a structurally separate identity system — a `PortalUser` is never a `User`, never has a `Membership`, and is resolved through completely different code paths — giving a freelancer's own clients a genuine, isolated, self-service view of their own projects and invoices. This is the single feature that most differentiates this codebase from a generic CRM template, and it is fully implemented end to end: invitation, signup, login, scoped read-only views, and isolation that's been both code-reviewed and test-covered.

**A real, working billing system exists**, not a stub: a typed plan catalog with server-enforced entitlements (member/client/project/storage limits), and a genuine Paddle integration — checkout, Customer Portal, and signature-verified webhook processing — that activates automatically once a real Paddle account is connected, with zero code changes required. It has never been exercised against a live Paddle sandbox, which is disclosed plainly rather than hidden.

**A full internal collaboration layer exists**: an append-only Activity audit log behind every mutation, threaded comments with @-mentions on Projects and Tasks, and a real Notification Center (in-app + best-effort email + background retry/cleanup jobs) — this is meaningfully more than most CRM MVPs build.

**Supporting systems are also real, not decorative**: a live-computed onboarding checklist, a staff Analytics dashboard with real charts over real data, cross-entity global search, a Business Identity/company-profile settings area with logo upload, a read-only Platform Admin console for whoever operates the deployment across all tenants, and Privacy Policy/Terms of Service pages with consent surfacing.

**Security work is substantial and verifiable, not asserted.** The Supabase auto-generated Data API has been deliberately locked down at the database-privilege level so the app's own server-side authorization is the only path to the data; session cookies are hardened; rate limiting and HTTP security headers are in place; and 14 dedicated, CI-enforced static checks continuously guard specific tenant-isolation and identity-separation invariants.

**The engineering process itself is mature.** 2,332 automated tests (unit, integration against a real Postgres, and full end-to-end browser tests) currently pass, alongside a clean lint run, a clean TypeScript check, and a successful production build — verified on the exact approved final head of the most recent merged PR (#70), with GitHub CI independently validating that same head before merge (see Part 21's "Current verification (Invoice System official Slice 2 complete, PR #70)" subsection). Two GitHub Actions workflows gate every change.

**What is genuinely not finished** is a short, specific, already-disclosed list rather than a vague sense of incompleteness: custom-domain DNS verification is a permanent no-op, Invoice Issue/finalization/PDF export/email delivery remain unbuilt (official Slice 2 — DRAFT create/edit, non-DRAFT lifecycle management, and Duplicate-as-new-DRAFT — is complete as of PR #70, but official Slices 3–5 haven't started), billing reconciliation/trial-ending reminders don't exist yet, and rate limiting doesn't yet work across multiple server instances. None of these are hidden — they're stated in the README's own Roadmap section and confirmed independently in this investigation.

---

## PART 26 — Current State of the Product

Based on the evidence gathered in this investigation, Client Portal CRM sits at: **a functional, feature-complete SaaS application that has never processed a real transaction or served a real paying customer** — best described as an **advanced, near-production MVP**, not a prototype, and not yet a battle-tested production SaaS.

**What already works, end to end, right now:** every core CRM workflow, real multi-tenant isolation, the full Client Portal, a real (if never live-fired) billing integration, notifications, comments, search, analytics — now including the completed Portal Analytics engagement metrics (Phase 22/PR #60–#61) — onboarding, a repaired and schema-enforced Invoice tenant-scoping column, and a complete, official-Slice-2 staff-facing Invoice System (schema/calculation/currency/Client-billing foundation, real flat+itemized DRAFT create/edit, non-DRAFT lifecycle management with Cancel, and Duplicate-as-new-DRAFT, Phase 23/PR #63–#70), and a clean automated-quality bar (lint/typecheck/build/2,332 tests all currently green).

**What prevents calling it "production-ready" today:**
1. The Paddle integration has never been validated against a real sandbox account — first real-money code path is still unproven in practice, even though it's fully implemented and unit/integration/mock-tested.
2. No real customer or usage history exists anywhere — every "org" in the system so far is a demo/seed/test artifact.
3. A handful of specific, bounded functional gaps remain open: domain verification, the Issue/finalization/PDF/email work still ahead in official Invoice System Slices 3–5, billing reconciliation, and multi-instance rate limiting.

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
- The 14 `scripts/security-checks/` static checks and the 2,332-test suite — treat a red result here as a real regression signal, and extend this pattern (a new invariant gets a new check) rather than inventing a different verification mechanism.
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
- **Invoice System — official Slice 1 (schema/calculation/currency/Client-billing/flat-dual-write foundation, PR #65) is complete. Official Slice 2 is now also complete**: its Slice 2a (client-bundle-safe calculation/currency code plus a pure, unwired lifecycle-transition/line-item-form foundation, PR #67) and Slice 2b (real staff-facing flat+itemized `DRAFT` create/edit, server-side total recomputation, non-`DRAFT` lifecycle enforcement with an "Issued" view and Cancel, PR #68) development-time subdivisions shipped first, and PR #70 then shipped **Duplicate-as-new-DRAFT** (informally tracked in this project's own development history as "Slice 2c," though `docs/invoicing-architecture.md` itself has not been amended to name that split — §3.2 still describes "Cancel + Duplicate-as-new-DRAFT" as one undivided mechanism, which is exactly what shipped), closing official Slice 2 out entirely. What remains: **official Slice 3**, the combined Issue/finalization operation (with `issuerSnapshot`/`recipientSnapshot` writes) and immutable PDF generation/archival/download, which ship together as one slice, not as separate slices — then **official Slice 4** (Invoice send/resend email and an `InvoiceEmailAttempt` writer), and **official Slice 5** (the final `NOT NULL` contract on the calculated-total columns, the organization-wide invoice-numbering constraint, the corrected portal DRAFT-visibility fix, and final whole-feature test/seed/doc closure) — all still unstarted. The two Invoice migrations merged so far (`20260911090000_repair_invoice_organization_scope`, `20260912090000_add_invoice_system_slice1_foundation` — neither Slice 2a, Slice 2b, nor PR #70 added a new migration) still require a separate, controlled deployment/operator step against any real external/staging/production database — neither has been applied outside this repository's local ephemeral test harness. See `docs/invoicing-architecture.md` for the complete slice plan.
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

You are continuing development of an **existing, substantially-built** multi-tenant CRM SaaS application called **Client Portal CRM**. It is not a new project and should not be treated as a blank slate. The current application-state baseline is `main` @ commit `23142ce6e7b2e739f874511c871ed3f65a4f3ce0` (187 commits) — the original full investigation was performed earlier, at commit `d76cd51c54594ae0f5743b1918fbae60ac8c1126`, and `main` has since moved forward through thirteen application/documentation changes: #58 (a one-line test housekeeping change), #59 (added this document to version control, documentation-only), #60–#61 (**Portal Analytics completion**), #62 (a prior documentation-only refresh of this file), #63–#65 (**Invoice System: organization-scope repair, approved architecture, and Slice 1 foundation**), #66 (a documentation-only Slice 1 context refresh), #67–#68 (**Invoice System Slice 2a and Slice 2b**), #69 (a documentation-only refresh/correction after Slice 2b, documentation-only), #70 (**Duplicate-as-new-DRAFT, completing official Invoice System Slice 2** — see below). The following has already been built and verified working: lint clean, TypeScript clean, production build succeeds, **2,332 automated tests passing**, 14 dedicated security checks passing — the full local command suite passed on the initial implementation head `7b829f9ac53bc36989b3e270ff9f40ad5d3206ef` within PR #70, and GitHub CI independently validated the exact final approved head, `e9f16fb8f3464b16fe48e227711c9daae909d75f` (the latest application change, differing from `7b829f9` only by a test-evidence-strengthening commit touching two test files, no production code) — see Part 21's "Current verification (Invoice System official Slice 2 complete, PR #70)" subsection for full provenance.

**Product:** a CRM for freelancers/agencies — Clients, Projects, Tasks, Invoices — plus a genuinely separate **Client Portal** where a freelancer's own clients log in with their own identity to see only their own projects/invoices. This Client Portal is the product's strongest differentiator versus a generic CRM template.

**Architecture:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Prisma 7 against PostgreSQL (Supabase-hosted), Supabase Auth (two separate identity spaces — staff `User` and portal `PortalUser`), Supabase Storage (private `attachments` bucket + public `logos` bucket), deployed on Vercel. **No REST/GraphQL API for the app's own UI** — Server Components read via Prisma directly, mutations go through Server Actions; a handful of real Route Handlers exist only for webhooks, file downloads, cron, and search. No client-side data-fetching library, no global state library, no schema-validation library (validation is hand-rolled `FormData` parsing per feature).

**Database:** 26 Prisma models, 22 Prisma enums, 25 migrations, 1,494 lines in `prisma/schema.prisma`. Every business entity carries `organizationId` for tenant scoping. Key models: `User`, `Organization`, `Membership` (role: Owner/Admin/Member), `Invitation`, `Client` (now with seven optional billing-identity fields — `billingLegalName`/`taxId`/`streetAddress`/`city`/`state`/`postalCode`/`country`, PR #65), `Project`, `Task`, `Invoice` (`organizationId` required/repaired PR #63; additive Slice 1 discount/tax/calculated-total/finalization columns from PR #65, now read and written by the real Slice 2b `DRAFT` create/edit form/actions — `subtotal`/`discountAmount`/`taxAmount` remain nullable at the schema level until Slice 5's `NOT NULL` contract migration, and finalization fields remain unwritten/null), `InvoiceLineItem` (**real production writer since Slice 2b, PR #68, unchanged by PR #70's Duplicate-as-new-DRAFT** — real staff DRAFT create/edit UI, server-assigned contiguous positions), `InvoiceEmailAttempt` (**remains schema-reserved only — still no production writer as of PR #70**), `Activity` (append-only audit log), `Notification`/`NotificationDelivery`/`NotificationPreference`, `Attachment`, `Comment`/`CommentMention`, `PortalUser` (nullable `lastLoginAt` — a single mutable current-state timestamp of the most recent tracked portal login or genuine first invitation acceptance, not a login history) / `ClientInvitation` (the separate client-facing identity), `PortalDownloadRequest` (organization-only, immutable download-link-issuance events — Phase 22/PR #60), `Subscription`/`WebhookEvent` (billing), `OrganizationProfile`/`OrganizationPaymentDetails`/`OrganizationDomainSettings`, `OrganizationOnboardingStep`.

**Auth:** Supabase Auth for both identity spaces, fully separate code paths (`src/lib/current-user.ts` for staff, `src/lib/current-portal-user.ts` for portal) — never merge these. Signup, login, logout, forgot/reset password all work for both. No OAuth. Email verification via a real Supabase callback route.

**Multi-tenancy:** real, not cosmetic — every query is scoped server-side from a verified session; an `active_organization_id` cookie is a UX preference only, always re-verified against a live Membership before being trusted; an organization switcher exists for multi-membership users; roles are enforced in Server Actions, not just hidden in the UI.

**Already built and working end-to-end:** Clients/Projects/Tasks CRUD; a complete, official-Slice-2 staff Invoice workflow (flat-or-itemized `DRAFT` create/edit, non-`DRAFT` lifecycle management, Cancel, and Duplicate-as-new-DRAFT — see below); Dashboard with real KPIs/charts; staff Analytics with real trend charts, **including the now-complete Portal Analytics engagement metrics** ("Recently active portal users" and "Download-link requests" — plain current-range scalar counts backed by real, minimal, privacy-preserving persistence added in Phase 22/PR #60–#61, deliberately not `GrowthMetric`s/charts); Team & role management; staff and Client Portal invitations; file Attachments (Supabase Storage) on Clients/Projects/Invoices; an Activity audit-log timeline; threaded Comments with @-mentions on Projects/Tasks (staff-only, no portal-facing messaging exists); a Notification Center (in-app + best-effort email + background retry/cleanup cron jobs); a live-computed Onboarding checklist; cross-entity global search; a Business Identity/company-profile settings area with logo upload; Payment Receiving Details (a plain-text record, not a payment processor); a read-only Platform Admin console for the deployment operator across all tenants; Privacy Policy/Terms of Service pages; password recovery for both staff and portal users; and a real, typed billing plan catalog with server-enforced entitlements plus a genuine Paddle integration (checkout, Customer Portal, signature-verified webhooks) that activates automatically once a real Paddle account is configured.

**Invoice System — official Slice 2 complete (Phase 23/PR #63–#70):** `Invoice.organizationId` was repaired from a silently-unwritten, nullable column to a required, correctly-written tenant-scoping column (PR #63; the repair migration has not been applied to any external/staging/production database — that remains a separate operator step). A full target architecture (`docs/invoicing-architecture.md`) was approved, covering itemization, lifecycle, PDF archival, email/idempotency, portal visibility, and a five-slice implementation plan (PR #64, documentation-only). **Slice 1** (PR #65) shipped the additive schema (`InvoiceLineItem`/`InvoiceEmailAttempt`, discount/tax/calculated-total columns), a pure Decimal calculation engine, a bounded invoice-currency contract, and `Client` billing-identity fields with a real form ("Billing details") — no Invoice-facing UI yet. **Slice 2a** (PR #67) made the calculation/currency code permanently client-bundle-safe (Prisma import from the generated browser entry point, `Prisma.Decimal.isDecimal()` duck-typing across distinct generated Decimal classes) and added a pure, unwired foundation: `ALLOWED_STATUS_TRANSITIONS`/`isTransitionAllowed()`/`computePaidAtUpdate()` for lifecycle, a type-only `IssueInvoice*` contract for the future Issue operation, and bounded line-item form encode/decode helpers — no live route/action/UI change. **Slice 2b** (PR #68) wired all of it into a real, live staff workflow: a mode-strict (`"flat"`/`"itemized"`, no other value accepted) `DRAFT` create/edit form with fields for project, currency, issue date, optional due date, discount type/value, optional tax rate/label, notes, and internal notes (status is never a submitted field; create always forces `DRAFT`); every total is recomputed server-side via `calculateInvoiceTotals()`, never trusted from the client preview; `InvoiceLineItem` now has a real production writer with server-assigned contiguous positions; `DRAFT` edits use a page-rendered-version optimistic-concurrency guard with a strictly-monotonic `updatedAt` write on real changes; every existing non-`DRAFT` invoice renders through a real read-only view governed by a single lifecycle action enforcing the 7-cell allowed-transition matrix, with `SENT` labeled "Issued" across staff-facing surfaces (Portal wording unchanged); Cancel is implemented through the same lifecycle action; delete remains `DRAFT`-only; `internalNotes` stays staff-only and editable in every status. **PR #70 shipped Duplicate-as-new-DRAFT**, completing official Slice 2 exactly as scoped in `docs/invoicing-architecture.md` §3.2: only an authorized, exactly-`CANCELLED` invoice exposes "Duplicate as new draft" (`/invoices/[id]/duplicate`); opening the page performs zero writes (an explicit, minimal Prisma `select` — never `include` — with its result type inferred via `Prisma.InvoiceGetPayload`); the invoice-number suggestion is exactly `` `${original.trim()}-R1` `` (no increment/search/reservation, never auto-submitted); source currency is canonicalized (`trim().toUpperCase()`) by the page itself, before the mapper ever runs, and an unsupported currency renders a disclosed 200 blocked state (never a silent USD fallback, no `InvoiceForm` constructed); the pure mapper takes an injected `today` and applies an exact allowlist — `issueDate` resets to `today`, `dueDate`/`internalNotes` reset blank, `notes` and the discount/tax inputs are copied unchanged, a flat source's `amount` is copied while an itemized source's `amount` is forced to `""`, and only `description`/`quantity`/`unitPrice` are carried per line item — every other field (ids, positions, line totals, aggregate totals, source identity, `status`, `paidAt`, tenant ids, attachments, email attempts, finalization/archive fields) is never copied. Submission goes through the ordinary, unmodified `createInvoiceAction` with no `sourceInvoiceId` ever added to the form — the created invoice is an ordinary new `DRAFT`, and the source invoice is left completely unchanged. **Migration provenance is exact:** PR #63 added `20260911090000_repair_invoice_organization_scope`; PR #65 added `20260912090000_add_invoice_system_slice1_foundation`; PR #67, PR #68, and PR #70 added no migration at all. **Neither of those two Invoice migrations has been applied to any external/staging/production database** by any of these development tasks. **Still not implemented:** the combined Issue/finalization operation and PDF archival/export that make up official Slice 3 (they ship together, not as separate slices); official Slice 4's invoice email delivery (`InvoiceEmailAttempt` remains schema-reserved with no writer); and official Slice 5's Portal DRAFT-visibility fix and `NOT NULL` contract migration.

**Security already implemented:** Supabase's auto-generated Data API is deliberately locked down (public-schema Postgres grants revoked) — this app does **not** use Row-Level Security policies; all authorization is application-layer, enforced through Prisma with a server-side connection. Session cookies are hardened. Rate limiting (currently in-memory/per-instance) and HTTP security headers are in place. 14 dedicated static security/invariant checks run in CI.

**What is complete:** essentially the entire feature list above, end to end (UI + Server Action + DB persistence + authorization all verified present).

**What is partial/known-incomplete (already disclosed in the repo's own README, not hidden):**
- Paddle billing is fully implemented in code but has **never been validated against a real Paddle sandbox account** — no live transaction has ever occurred.
- Custom-domain DNS verification is unimplemented — a saved domain stays "pending" forever by design.
- Staff can create/edit/delete flat and itemized `DRAFT` invoices, manage the seven allowed transitions among existing non-`DRAFT` legacy invoices, and duplicate a `CANCELLED` invoice into a fresh `DRAFT` — all implemented end to end. Official Slice 1 (PR #65) shipped first as its own separate slice; **official Invoice System Slice 2 is now also complete**, delivered through its Slice 2a/Slice 2b development subdivisions (PR #67/#68) plus the Duplicate-as-new-DRAFT remainder (PR #70) — but there is still no combined Issue/finalization-and-PDF-archival operation (official Slice 3), and no send-by-email flow (official Slice 4). That's official Slices 3–5, not started.
- Billing reconciliation and trial-ending reminder notifications don't exist yet.
- Rate limiting is per-instance/in-memory, not yet safe for a multi-instance deployment.
- No OSS license file exists for the original application code (a legal/provenance matter, not a code defect).
- A historical "save on a Settings page redirects to /login" symptom was investigated but never conclusively explained; the investigation did rule out client-side/server-wrapper `autoRefreshToken` configuration as the cause, for this project's exact `@supabase/ssr` version (it forces the relevant auth options unconditionally, regardless of what calling code passes). Whether the symptom itself still occurs on current `main` is unknown and untestable by anything in this repo's own test suite (real Supabase Auth would be required) — treat as a low-confidence, non-blocking validation item, not a confirmed bug.

**Two branches that previously sat unmerged and undecided have since been fully triaged and closed (PR #58, `91234ade4cd5f9bc6cf28531e4355640a492ea56`, then deleted):** the auth-hardening branch was closed as redundant (see above — it changed nothing `@supabase/ssr` wasn't already enforcing); the E2E-selector branch was adopted only for one test simplification (a direct `getByRole` sign-out selector), with its `data-testid` additions and settings-form changes deliberately declined. Neither branch exists anymore, locally or on `origin`. This is not an open item for you to pick up — it's included here only so you don't rediscover and re-relitigate it.

**Known problems:** no other hidden mocks, fake data, or disconnected forms were found in a full repository sweep — what looks built generally *is* built, end to end, with real database persistence and real authorization checks. The gaps above are the actual, bounded gap list, not a vague "lots of things are probably fake" concern.

**Important architectural decisions to respect:** the multi-tenant retrofit (Organization/Membership/organizationId scoping) is foundational and must never be undone; the staff/portal identity separation is intentional and structural; there is no REST API layer to "complete" — Server Actions are the real API surface; several models (`Activity.entityId`, `Notification.entityId`, `Attachment.entityId`, `Comment.entityId`) intentionally omit foreign keys so audit/history rows survive deletion of the thing they describe — don't "fix" these into real FKs.

---

**The next stage is to take this existing, substantially-complete application and systematically turn it into a fully functional, secure, production-ready SaaS** — validating what's implemented (especially real Paddle sandbox/live billing), closing the specific disclosed gaps above, and hardening what's already there for real customers. This is **not** a rebuild-from-scratch project.

**Official Invoice System Slice 2 is complete (through PR #70) — if invoicing work continues, the immediate next bounded task is official Slice 3 design/implementation investigation**: the combined Issue/finalization operation and immutable PDF archival/download, which ship together as one slice, not as separate slices. Duplicate-as-new-DRAFT is **not** the next task — it already shipped. After Slice 3, **official Slice 4** is invoice email send/resend, and **official Slice 5** is contract migration/Portal-visibility closure — see `docs/invoicing-architecture.md` and Part 28. **Paddle/billing is a separate, already-implemented, deliberately deferred track** (live sandbox validation is its own gap, unrelated to and not blocking Invoice System work) — do not begin or redesign Paddle work as part of continuing the Invoice System.

You should help with: determining development priorities across the gap list above; preparing well-scoped tasks/prompts to hand to Claude Code (which has direct repository access) for implementation; reviewing Claude's resulting code/PRs at a product and architecture level; flagging bugs, security concerns, or architectural inconsistencies as they come up; making product decisions where the existing implementation leaves something ambiguous; and tracking overall progress toward production readiness. Do not propose rebuilding features from this list as if they don't exist — verify against the actual repository (or ask for a fresh inspection) before assuming something is missing that this document lists as already built.
