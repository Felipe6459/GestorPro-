import type { PlanKey } from "@/lib/billing/plans";
import type { SubscriptionStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { prisma } from "@/lib/prisma";

/** Same shape as src/lib/billing/usage.ts's own `PrismaClientOrTx` — defined independently here (not imported) to keep the analytics domain decoupled from Billing's internals. */
export type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

/**
 * Analytics Stage 1 (docs/analytics-architecture.md §4). The five ranges
 * this subsystem's own selector will offer — a fixed, closed set (not an
 * arbitrary date picker) so every downstream query has a small, enumerable
 * set of shapes to be indexed/tested against, rather than an unbounded
 * range space. `allTime` has no lower bound at all (see
 * calculations/date-ranges.ts's own TimeRangeBounds).
 */
export type TimeRange = "today" | "last7Days" | "last30Days" | "last90Days" | "allTime";

export const ALL_TIME_RANGES: readonly TimeRange[] = ["today", "last7Days", "last30Days", "last90Days", "allTime"];

/** A resolved [start, end) window in UTC — `start: null` means "no lower bound" (`allTime` only). */
export type TimeRangeBounds = {
  start: Date | null;
  end: Date;
};

/**
 * Foundation-only counts (docs/analytics-architecture.md §5.1) — every
 * field here is a live, unfiltered-by-time total for the organization
 * today, independent of whatever TimeRange the caller asked for. Mirrors
 * src/lib/billing/usage.ts's own "one bounded read, several parallel
 * counts" shape.
 */
export type OrganizationMetrics = {
  totalClients: number;
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  totalInvoices: number;
  totalMembers: number;
  totalAttachments: number;
};

/**
 * Calendar-aligned (not rolling — see calculations/date-ranges.ts's own
 * `getCalendarBoundaries` doc comment) counts of Activity rows, always
 * computed regardless of the caller's selected TimeRange — "how busy has
 * this organization been today / this week / this month" is a fixed
 * question, not one a range selector should change the meaning of.
 */
export type ActivityMetrics = {
  createdToday: number;
  createdThisWeek: number;
  createdThisMonth: number;
};

/**
 * 0–100, integer, `round(completed / total * 100)` — `0` (never NaN/
 * Infinity) when `total` is `0`, since an org with no tasks/invoices yet
 * has trivially completed none of them. See calculations/rates.ts.
 */
export type CompletionMetrics = {
  taskCompletionRate: number;
  invoiceCompletionRate: number;
};

/**
 * One dimension's current-vs-previous-equal-length-period comparison
 * (docs/analytics-architecture.md §5.4). `changePercent` is `null` — never
 * `Infinity`/`NaN` — whenever `previousPeriodCount` is `0`, since "grew
 * from zero" has no finite percentage (see calculations/rates.ts).
 */
export type GrowthMetric = {
  currentPeriodCount: number;
  previousPeriodCount: number;
  changePercent: number | null;
};

export type GrowthMetrics = {
  clientGrowth: GrowthMetric;
  projectGrowth: GrowthMetric;
  taskGrowth: GrowthMetric;
};

/**
 * Deliberately re-reads src/lib/billing/entitlements.ts's own
 * `getOrganizationEntitlements()` rather than re-deriving these two fields
 * from the Subscription row directly — that function is already the one
 * place LEGACY/unrecognized-planKey normalization happens (Billing Stage 5
 * audit fix), and duplicating that logic here would risk the two
 * subsystems silently disagreeing on what an organization's plan "is".
 * Foundation-only: no limits/usage duplicated here (Billing's own
 * `/settings/billing` page is the one place for that).
 */
export type BillingMetrics = {
  planKey: PlanKey;
  subscriptionStatus: SubscriptionStatus | "LEGACY";
};

/**
 * Deliberately re-reads src/lib/onboarding/progress.ts's own
 * `getOrganizationOnboardingProgress()` rather than re-deriving a percent
 * from OrganizationOnboardingStep rows directly — that function is the
 * one place "percent" already has a single, tested definition (excludes
 * WELCOME, includes FINISH; see that module's own doc comment).
 */
export type OnboardingMetrics = {
  percent: number;
  completedCount: number;
  totalCount: number;
};

/** The full Stage 1 foundation snapshot — one call, one consistent `computedAt` instant, every dimension this stage defines. */
export type AnalyticsSnapshot = {
  organizationId: string;
  timeRange: TimeRange;
  computedAt: Date;
  organization: OrganizationMetrics;
  activity: ActivityMetrics;
  completion: CompletionMetrics;
  growth: GrowthMetrics;
  billing: BillingMetrics;
  onboarding: OnboardingMetrics;
};
