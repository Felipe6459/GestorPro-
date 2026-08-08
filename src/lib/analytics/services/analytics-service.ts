import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { assertCanViewAnalytics } from "../authorization";
import { getTimeRangeBounds, getPreviousPeriodBounds, getBucketUnit, getSeriesBounds } from "../calculations/date-ranges";
import { calculateCompletionRate } from "../calculations/rates";
import { DEFAULT_GROWTH_TIME_RANGE } from "../constants";
import { getOrganizationMetrics } from "../queries/organization-metrics";
import { getActivityMetrics } from "../queries/activity-metrics";
import { getInvoiceCompletionCounts } from "../queries/completion-metrics";
import { getGrowthMetrics } from "../queries/growth-metrics";
import { getBillingMetrics } from "../queries/billing-metrics";
import { getOnboardingMetrics } from "../queries/onboarding-metrics";
import {
  getClientGrowthSeries,
  getProjectGrowthSeries,
  getTaskActivitySeries,
  getInvoiceActivitySeries,
  getActivityEventsSeries,
} from "../queries/time-series";
import type { AnalyticsSnapshot, PrismaClientOrTx, TimeRange } from "../types";

/**
 * Analytics Stage 1 (docs/analytics-architecture.md §3/§8). The one public
 * entry point for the whole domain — every page/action that needs
 * analytics data calls this, never a query file directly, so the
 * OWNER/ADMIN authorization check below can never be forgotten at a call
 * site (mirrors src/lib/billing/enforcement.ts's own "one guarded
 * entry point per write" discipline, applied here to a read).
 *
 * `now` defaults to `new Date()` but is accepted as a parameter so tests
 * get a deterministic instant (every calculation downstream is pure given
 * `now` — see calculations/date-ranges.ts).
 *
 * Every independent metric group runs concurrently (Promise.all) — this
 * is a fixed, small number of bounded aggregate queries (never a
 * `findMany` of full rows, never N+1), matching this codebase's own
 * established shape for a multi-section read (e.g. src/lib/billing/
 * view-model.ts's own `getBillingPageData`).
 */
export async function getOrganizationAnalytics(
  organizationId: string,
  role: Role,
  timeRange: TimeRange = "last30Days",
  now: Date = new Date(),
  client: PrismaClientOrTx = prisma,
): Promise<AnalyticsSnapshot> {
  assertCanViewAnalytics(role);

  const growthTimeRange = timeRange === "allTime" ? DEFAULT_GROWTH_TIME_RANGE : timeRange;
  const growthBounds = getTimeRangeBounds(growthTimeRange, now);
  const previousGrowthBounds = getPreviousPeriodBounds(growthBounds);

  // Stage 3: chart series use their own bounds (getSeriesBounds caps
  // `allTime` to MAX_CHART_WEEKS — see that function's own doc comment)
  // and their own adaptive bucket unit — independent of growthBounds,
  // which stays exactly as Stage 1 defined it for the KPI growth cards.
  const seriesBounds = getSeriesBounds(timeRange, now);
  const bucketUnit = getBucketUnit(timeRange);

  const [organization, activity, invoiceCounts, growth, billing, onboarding, clientGrowthSeries, projectGrowthSeries, taskActivitySeries, invoiceActivitySeries, activityEventsSeries] =
    await Promise.all([
      getOrganizationMetrics(client, organizationId),
      getActivityMetrics(client, organizationId, now),
      getInvoiceCompletionCounts(client, organizationId),
      getGrowthMetrics(client, organizationId, growthBounds, previousGrowthBounds),
      getBillingMetrics(client, organizationId, now),
      getOnboardingMetrics(organizationId),
      getClientGrowthSeries(client, organizationId, seriesBounds, bucketUnit),
      getProjectGrowthSeries(client, organizationId, seriesBounds, bucketUnit),
      getTaskActivitySeries(client, organizationId, seriesBounds, bucketUnit),
      getInvoiceActivitySeries(client, organizationId, seriesBounds, bucketUnit),
      getActivityEventsSeries(client, organizationId, seriesBounds, bucketUnit),
    ]);

  const billableInvoices = organization.totalInvoices - invoiceCounts.cancelledInvoices;

  return {
    organizationId,
    timeRange,
    computedAt: now,
    organization,
    activity,
    completion: {
      taskCompletionRate: calculateCompletionRate(organization.completedTasks, organization.totalTasks),
      invoiceCompletionRate: calculateCompletionRate(invoiceCounts.paidInvoices, billableInvoices),
    },
    growth,
    billing,
    onboarding,
    charts: {
      clientGrowthSeries,
      projectGrowthSeries,
      taskActivitySeries,
      invoiceActivitySeries,
      activityEventsSeries,
    },
  };
}
