import { OnboardingProgressBar } from "@/components/onboarding/onboarding-progress-bar";
import type { ChartSeries, OnboardingMetrics } from "@/lib/analytics/types";
import { GrowthLineChart } from "./growth-line-chart";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

/**
 * Analytics Stage 3 ("Organization activity: Activity events; onboarding
 * progress; subscription status transitions — aggregate only"). Three
 * distinct signals in one section:
 *
 * - Activity events — a real chart (GrowthLineChart), same component
 *   every other single-series chart on this page uses.
 * - Onboarding progress — deliberately reuses
 *   src/components/onboarding/onboarding-progress-bar.tsx unmodified
 *   (read-only reuse, same rule Stage 1 already established for
 *   queries/onboarding-metrics.ts) rather than building a second progress
 *   bar; an organization with no OrganizationOnboardingStep rows at all
 *   (never onboarded, or pre-Onboarding-stage) still renders a real,
 *   correct 0%-or-higher bar — `getOrganizationOnboardingProgress()`
 *   already has no error path for that case.
 * - Subscription status transitions — a single aggregate number
 *   (`subscriptionEventCount`), deliberately NOT a chart: the task's own
 *   "aggregate only" instruction, and queries/billing-metrics.ts's own
 *   `getSubscriptionEventCount` never reads anything about an individual
 *   event.
 *
 * Design System Batch 4 — OnboardingProgressBar is deliberately NOT
 * migrated here: it's shared with OnboardingCard (src/components/
 * onboarding/onboarding-card.tsx), which stays out of this batch's scope
 * (see the Batch 4 PR description's own disclosed boundary). It remains
 * a known raw-light island inside this now-migrated section.
 */
export function OrganizationActivitySection({
  activityEventsSeries,
  onboarding,
  subscriptionEventCount,
}: {
  activityEventsSeries: ChartSeries;
  onboarding: OnboardingMetrics;
  subscriptionEventCount: number;
}) {
  return (
    <section aria-labelledby="analytics-org-activity-heading" className={`p-5 ${CARD_SURFACE_CLASSES}`}>
      <h2 id="analytics-org-activity-heading" className="text-text-primary text-base font-semibold">
        Organization activity
      </h2>

      <div className="mt-4">
        <p className="text-text-primary text-sm font-medium">Activity events</p>
        <div className="mt-2">
          <GrowthLineChart label="Activity events" series={activityEventsSeries} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <p className="text-text-primary text-sm font-medium">Onboarding progress</p>
          <div className="mt-2">
            {/* OnboardingProgressBar: deliberately left raw-light — see this
                file's own doc comment. */}
            <OnboardingProgressBar
              completedCount={onboarding.completedCount}
              totalCount={onboarding.totalCount}
              percent={onboarding.percent}
            />
          </div>
        </div>

        <div>
          <p className="text-text-primary text-sm font-medium">Subscription events</p>
          <p className="text-text-primary mt-2 text-2xl font-semibold tracking-tight">{subscriptionEventCount}</p>
          <p className="text-text-muted mt-1 text-xs">Processed status transitions, all time.</p>
        </div>
      </div>
    </section>
  );
}
