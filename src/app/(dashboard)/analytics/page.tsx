import { notFound } from "next/navigation";
import { getCurrentMembership } from "@/lib/current-user";
import { getOrganizationAnalytics } from "@/lib/analytics/services/analytics-service";
import { canViewAnalytics } from "@/lib/analytics/authorization";
import { TIME_RANGE_LABELS, DEFAULT_TIME_RANGE } from "@/lib/analytics/constants";
import { formatStatusLabel } from "@/lib/format";
import { MetricsSection } from "@/components/analytics/metrics-section";
import { GrowthSection } from "@/components/analytics/growth-section";

/**
 * Analytics Stage 1 (docs/analytics-architecture.md §9). Foundation-only
 * page — plain numbers in a grid, no charts, no range selector UI yet
 * (always renders `DEFAULT_TIME_RANGE`; the service layer already accepts
 * any `TimeRange`, so wiring a real selector in a later stage is additive,
 * not a rework). `notFound()` for MEMBER — a hard block, not a
 * read-only/disabled view like Billing's own page, matching this stage's
 * explicit "OWNER/ADMIN only" security requirement. Client Portal
 * identities never reach this at all: this route lives under
 * `(dashboard)`, whose layout already redirects any Portal-only identity
 * to `/portal` before this page ever renders.
 */
export default async function AnalyticsPage() {
  const { organizationId, membership } = await getCurrentMembership();

  if (!canViewAnalytics(membership.role)) {
    notFound();
  }

  const data = await getOrganizationAnalytics(organizationId, membership.role, DEFAULT_TIME_RANGE);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Analytics</h1>
      <p className="mt-1 text-sm text-gray-500">
        {TIME_RANGE_LABELS[data.timeRange]} · derived entirely from your organization&apos;s own data.
      </p>

      <div className="mt-6 space-y-6">
        <MetricsSection
          id="analytics-overview"
          title="Overview"
          metrics={[
            { label: "Clients", value: data.organization.totalClients },
            { label: "Projects", value: data.organization.totalProjects },
            { label: "Tasks", value: data.organization.totalTasks },
            { label: "Completed tasks", value: data.organization.completedTasks },
            { label: "Open tasks", value: data.organization.openTasks },
            { label: "Invoices", value: data.organization.totalInvoices },
            { label: "Members", value: data.organization.totalMembers },
            { label: "Attachments", value: data.organization.totalAttachments },
          ]}
        />

        <MetricsSection
          id="analytics-activity"
          title="Activity"
          metrics={[
            { label: "Today", value: data.activity.createdToday },
            { label: "This week", value: data.activity.createdThisWeek },
            { label: "This month", value: data.activity.createdThisMonth },
          ]}
        />

        <MetricsSection
          id="analytics-completion"
          title="Completion"
          metrics={[
            { label: "Task completion rate", value: `${data.completion.taskCompletionRate}%` },
            { label: "Invoice completion rate", value: `${data.completion.invoiceCompletionRate}%` },
          ]}
        />

        <GrowthSection
          clientGrowth={data.growth.clientGrowth}
          projectGrowth={data.growth.projectGrowth}
          taskGrowth={data.growth.taskGrowth}
        />

        <MetricsSection
          id="analytics-status"
          title="Status"
          metrics={[
            { label: "Plan", value: formatStatusLabel(data.billing.planKey) },
            { label: "Subscription status", value: formatStatusLabel(data.billing.subscriptionStatus) },
            { label: "Onboarding progress", value: `${data.onboarding.percent}%` },
          ]}
        />
      </div>
    </div>
  );
}
