import { getCurrentMembership } from "@/lib/current-user";
import { getOrganizationAnalytics } from "@/lib/analytics/services/analytics-service";
import { AnalyticsAccessError } from "@/lib/analytics/authorization";
import { parseTimeRangeParam } from "@/lib/analytics/constants";
import { getPlan } from "@/lib/billing/plans";
import { StatusBadge } from "@/components/ui/status-badge";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { AnalyticsGrid } from "@/components/analytics/analytics-grid";
import { AnalyticsEmptyState } from "@/components/analytics/analytics-empty-state";
import { AnalyticsAccessDenied } from "@/components/analytics/analytics-access-denied";
import { GrowthIndicator } from "@/components/analytics/growth-indicator";

/**
 * Analytics Stage 2 (docs/analytics-architecture.md §9). Authorization is
 * enforced entirely server-side by `getOrganizationAnalytics()` itself
 * (it calls `assertCanViewAnalytics()` before running any query) — this
 * page never re-implements that check, it only decides how to *render*
 * the already-server-made decision. `AnalyticsAccessError` is caught
 * here, server-side, via `instanceof` (safe: this catch runs in the same
 * process as the throw, never crosses a serialization boundary) and
 * rendered as a dedicated "Access denied" state — deliberately NOT
 * delegated to this route's `error.tsx`, since Next.js redacts Server
 * Component error messages by default in production before they'd ever
 * reach a client-side error boundary, which would make it impossible to
 * reliably distinguish "access denied" from "something else broke" once
 * deployed. Every other thrown error (a real "unavailable data" failure)
 * still propagates to `error.tsx` normally. Client Portal identities
 * never reach this page at all: it lives under `(dashboard)`, whose
 * layout already redirects any Portal-only identity to `/portal` first.
 *
 * `range` is read from the URL (`?range=`), never a cookie — the task's
 * own explicit "survive refreshes via URL search params, not a cookie"
 * requirement; `parseTimeRangeParam` never trusts the raw value, falling
 * back to `DEFAULT_TIME_RANGE` for anything unrecognized.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId, membership } = await getCurrentMembership();
  const { range: rawRange } = await searchParams;
  const timeRange = parseTimeRangeParam(rawRange);

  let data;
  try {
    data = await getOrganizationAnalytics(organizationId, membership.role, timeRange);
  } catch (err) {
    if (err instanceof AnalyticsAccessError) {
      return <AnalyticsAccessDenied />;
    }
    throw err;
  }

  const isOverviewEmpty =
    data.organization.totalClients === 0 &&
    data.organization.totalProjects === 0 &&
    data.organization.totalTasks === 0 &&
    data.organization.totalInvoices === 0 &&
    data.organization.totalAttachments === 0;

  const plan = getPlan(data.billing.planKey);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <AnalyticsHeader selected={data.timeRange} />

      <div className="mt-6 space-y-6">
        {isOverviewEmpty ? (
          <AnalyticsEmptyState />
        ) : (
          <AnalyticsGrid
            id="analytics-overview"
            title="Overview"
            metrics={[
              { label: "Clients", value: data.organization.totalClients },
              { label: "Projects", value: data.organization.totalProjects },
              { label: "Tasks", value: data.organization.totalTasks },
              { label: "Completed tasks", value: data.organization.completedTasks },
              { label: "Invoices", value: data.organization.totalInvoices },
              { label: "Members", value: data.organization.totalMembers },
              { label: "Attachments", value: data.organization.totalAttachments },
            ]}
          />
        )}

        <AnalyticsGrid
          id="analytics-activity"
          title="Activity"
          metrics={[
            { label: "Today", value: data.activity.createdToday },
            { label: "This week", value: data.activity.createdThisWeek },
            { label: "This month", value: data.activity.createdThisMonth },
          ]}
        />

        <AnalyticsGrid
          id="analytics-completion"
          title="Completion"
          metrics={[
            { label: "Task completion rate", value: `${data.completion.taskCompletionRate}%` },
            { label: "Invoice completion rate", value: `${data.completion.invoiceCompletionRate}%` },
          ]}
        />

        <AnalyticsGrid
          id="analytics-growth"
          title="Growth"
          metrics={[
            {
              label: "Clients",
              value: data.growth.clientGrowth.currentPeriodCount,
              indicator: <GrowthIndicator metric={data.growth.clientGrowth} label="Client growth" />,
            },
            {
              label: "Projects",
              value: data.growth.projectGrowth.currentPeriodCount,
              indicator: <GrowthIndicator metric={data.growth.projectGrowth} label="Project growth" />,
            },
            {
              label: "Tasks",
              value: data.growth.taskGrowth.currentPeriodCount,
              indicator: <GrowthIndicator metric={data.growth.taskGrowth} label="Task growth" />,
            },
          ]}
        />

        <AnalyticsGrid
          id="analytics-status"
          title="Status"
          metrics={[
            { label: "Plan", value: plan.displayName },
            { label: "Subscription status", value: <StatusBadge status={data.billing.subscriptionStatus} /> },
            { label: "Onboarding progress", value: `${data.onboarding.percent}%` },
          ]}
        />
      </div>
    </div>
  );
}
