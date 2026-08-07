# Analytics — Architecture (Stage 1: Foundation)

## 1. Purpose

A provider-neutral analytics subsystem answering questions like "how many
clients exist," "what changed this week," and "is this organization
growing" — derived exclusively from data this application already owns.
No external event pipeline, no third-party analytics SDK (no Google
Analytics, Segment, Mixpanel, PostHog, or similar), no tracking pixels, no
browser fingerprinting, and no cookies beyond the existing
authentication/session cookie. Every number on this page is a Postgres
aggregate query away from a table this app already writes to for other
reasons.

## 2. Stage scope

Stage 1 is the **foundation layer only**:

- Typed metric calculations, queries, and one service entry point.
- A plain, numbers-only page at `/analytics`.
- Authorization (OWNER/ADMIN only).
- Unit + integration test coverage.

Explicitly **not** in Stage 1 (deferred to a future stage — see §9):
charts/sparklines, CSV/PDF export, scheduled/emailed reports, a live
range-selector UI, and configurable MEMBER access.

## 3. Directory layout

```
src/lib/analytics/
  types.ts                    All Stage 1 types (TimeRange, metric groups, AnalyticsSnapshot)
  constants.ts                Time-range labels/defaults
  authorization.ts            canViewAnalytics / assertCanViewAnalytics
  calculations/
    date-ranges.ts            Pure: TimeRange -> UTC bounds; calendar boundaries
    rates.ts                  Pure: completion rate, growth rate
  queries/
    organization-metrics.ts   Live totals (clients/projects/tasks/invoices/members/attachments)
    activity-metrics.ts       Activity counts (today/this week/this month)
    completion-metrics.ts     Invoice paid/cancelled counts
    growth-metrics.ts         Current-vs-previous-period counts (client/project/task)
    billing-metrics.ts        Thin wrapper over billing's entitlements
    onboarding-metrics.ts     Thin wrapper over onboarding's progress
  services/
    analytics-service.ts      getOrganizationAnalytics() — the one public entry point

src/components/analytics/     MetricCard, MetricsSection, GrowthSection (no charts)
src/app/(dashboard)/analytics/page.tsx
```

`queries/` never contains business rules — every query is a bounded,
org-scoped Prisma `count`/`aggregate`/`groupBy` and nothing else.
`calculations/` never touches Prisma — every function there is pure,
takes its inputs as plain values (including `now`, never reading the
system clock itself), and is unit-testable with no database. This mirrors
the split this codebase already uses in `src/lib/billing/` (`usage.ts` /
`access-mode.ts` / `entitlements.ts`).

## 4. Time ranges

```ts
type TimeRange = "today" | "last7Days" | "last30Days" | "last90Days" | "allTime";
```

A fixed, closed set — not an arbitrary date picker — so every downstream
query has a small, enumerable set of shapes. All bounds are computed in
UTC (`Date.UTC(...)`, `getUTCFullYear()`/etc. throughout `calculations/
date-ranges.ts` — never a local-timezone `Date` method), so the result is
identical regardless of which timezone the server process happens to run
in.

Two distinct kinds of "time" exist in this subsystem, deliberately not
unified into one:

- **Rolling windows** (`getTimeRangeBounds`) — `now - N days` to `now`.
  Used by growth metrics (§5.4), which need a genuine
  "period vs. the equal-length period right before it" comparison.
  `allTime` has `start: null` (no lower bound) and — since there is no
  "period before all time" — growth metrics fall back to
  `DEFAULT_GROWTH_TIME_RANGE` (`last30Days`) when `allTime` is requested;
  every other metric group still honors `allTime` literally.
- **Calendar-aligned boundaries** (`getCalendarBoundaries`) — UTC
  midnight of today, Monday 00:00 UTC of this ISO week, the 1st of this
  UTC month. Used by Activity metrics (§5.2) only, which ask a fixed
  question ("how busy has this org been today/this week/this month")
  independent of whatever `TimeRange` the caller separately selected for
  growth.

## 5. Metrics

### 5.1 Organization metrics

Live, unfiltered-by-time totals — "how many clients exist," not "how many
were created in the selected range." `totalTasks`/`completedTasks`
(`status = DONE`)/`openTasks` (`status IN (TODO, IN_PROGRESS, IN_REVIEW)`)
are three independent indexed counts, not a `groupBy` + in-memory
reduction (see `organization-metrics.ts`'s own comment for why).

### 5.2 Activity metrics

`createdToday` / `createdThisWeek` / `createdThisMonth` — three
independent counts against `Activity.createdAt`, using the
calendar-aligned boundaries from §4.

### 5.3 Completion metrics

`taskCompletionRate = round(completedTasks / totalTasks * 100)`, `0` when
`totalTasks` is `0` (never `NaN`).

`invoiceCompletionRate = round(paidInvoices / (totalInvoices -
cancelledInvoices) * 100)` — cancelled invoices are excluded from the
denominator: a cancelled invoice was never meant to be paid, and including
it would make the rate look artificially low for an organization that
cancels stale drafts as routine housekeeping.

### 5.4 Growth metrics

For each of Client/Project/Task: `currentPeriodCount` (rows created in
the resolved `TimeRange` window), `previousPeriodCount` (rows created in
the equal-length window immediately before it), and `changePercent =
round((current - previous) / previous * 100)` — **`null`**, never
`Infinity`/`NaN`, when `previousPeriodCount` is `0` ("grew from zero" has
no finite percentage; the UI renders this as an explicit "No prior-period
data" state, not a misleading `0%` or `∞%`).

### 5.5 Billing metrics

`planKey` / `subscriptionStatus` — a **read-only pass-through** of
`src/lib/billing/entitlements.ts`'s own `getOrganizationEntitlements()`.
Analytics never re-derives LEGACY/unrecognized-`planKey` normalization
itself; that logic already has one home (Billing Stage 5's audit fix), and
duplicating it here would risk the two subsystems silently disagreeing on
what an organization's plan "is." This is the only query file that reaches
into another domain's module — every other query touches Prisma directly.

### 5.6 Onboarding metrics

`percent` / `completedCount` / `totalCount` — a read-only pass-through of
`src/lib/onboarding/progress.ts`'s own `getOrganizationOnboardingProgress()`,
for the identical reason as §5.5: one tested definition of "percent,"
never a second one that can drift.

## 6. Multi-tenancy

Every query function takes `organizationId` as an explicit, required
parameter and filters every read by it — there is no "all organizations"
code path anywhere in this subsystem. `organizationId` is never accepted
from the client (page/action layer always resolves it server-side via
`getCurrentMembership()`, the same function every other dashboard route
already uses — see `src/lib/current-user.ts`). Legacy rows with a `null`
`organizationId` (pre-multi-tenant `Task`/`Invoice` rows — see
`prisma/schema.prisma`'s own nullable `organizationId` on those two
models) are simply excluded from every org-scoped count, by construction:
an equality filter against a real `organizationId` value never matches a
`null` column.

## 7. Security

Analytics data is available only to **OWNER** and **ADMIN**
(`src/lib/analytics/authorization.ts`). This is a hard block, not a
reduced/read-only view like Billing's own page: `assertCanViewAnalytics()`
is the one entry point every service call goes through
(`getOrganizationAnalytics()` calls it first, before any query runs), and
the page additionally calls `notFound()` for MEMBER rather than rendering
a disabled state — matching this stage's explicit requirement. MEMBER
access is intentionally not configurable yet; the single call site in
`authorization.ts` is where a future stage would add that. Client Portal
identities never reach this code at all — every call site lives under the
`(dashboard)` route group, whose layout already redirects any Portal-only
identity to `/portal` before any analytics function is ever called
(same guarantee `settings/billing/page.tsx` already documents for itself).

## 8. Performance

- Every query is a bounded, indexed `count`/`aggregate` — never a
  `findMany` of full rows, never an unbounded scan.
- Every metric group's internal reads run concurrently (`Promise.all`),
  and the five top-level metric groups in `getOrganizationAnalytics()`
  also run concurrently — one snapshot costs a small, fixed number of
  parallel round-trips, not a chain of sequential ones.
- No N+1: nothing loops over a result set to issue a second query per row.
- No client-side aggregation: every rate/count is computed in the
  database or in a pure function server-side; the client only ever
  receives already-computed numbers.

## 9. Deferred to a later stage

- Charts/sparklines for growth and activity trends.
- CSV/PDF export.
- Scheduled/emailed analytics reports.
- A live range-selector control (the service layer already accepts any
  `TimeRange`; the page currently always requests `DEFAULT_TIME_RANGE`
  — wiring a selector is additive, not a rework).
- Configurable MEMBER-level access (§7).
