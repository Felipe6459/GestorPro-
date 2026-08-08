import type { PortalMetrics, ChartSeries, DualChartSeries } from "@/lib/analytics/types";
import { AnalyticsGrid } from "../analytics-grid";
import { AnalyticsEmptyState } from "../analytics-empty-state";
import { GrowthIndicator } from "../growth-indicator";
import { Sparkline } from "./sparkline";
import { GrowthLineChart } from "./growth-line-chart";
import { ActivityStackedBarChart } from "./activity-stacked-bar-chart";
import { ComparisonBarChart } from "./comparison-bar-chart";
import { ChartsSection, ChartPanel } from "./charts-section";

/**
 * Analytics Stage 4 (docs/analytics-architecture.md §13/§14). Composed
 * entirely from Stage 2/3 components — `AnalyticsGrid`, `Sparkline`,
 * `GrowthLineChart`, `ActivityStackedBarChart`, `ComparisonBarChart`,
 * `ChartsSection` — the task's own "reuse wherever possible" requirement.
 * No new chart-rendering code exists in this file; it only decides which
 * already-built component gets which already-computed number.
 *
 * Deliberately does NOT render "recent logins" or "document download
 * count" — see §13 for why: neither is derivable from existing data
 * without adding new persistence (a login timestamp, a download-event
 * log), and the task's own instructions are to stop and document that
 * rather than build it.
 */
export function PortalAnalyticsSection({
  portal,
  portalUserGrowthSeries,
  portalInvitationSeries,
}: {
  portal: PortalMetrics;
  portalUserGrowthSeries: ChartSeries;
  portalInvitationSeries: DualChartSeries;
}) {
  const isPortalEmpty = portal.totalPortalUsers === 0 && portal.documentsAvailable === 0 && portal.invoicesVisible === 0;

  return (
    <section aria-labelledby="analytics-portal-heading" className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 id="analytics-portal-heading" className="text-base font-semibold text-gray-900">
        Portal
      </h2>

      <div className="mt-4 space-y-6">
        {isPortalEmpty ? (
          <AnalyticsEmptyState />
        ) : (
          <AnalyticsGrid
            id="analytics-portal-overview"
            title="Portal overview"
            metrics={[
              { label: "Portal users", value: portal.totalPortalUsers, sparkline: <Sparkline series={portalUserGrowthSeries} /> },
              { label: "Portal adoption", value: `${portal.portalAdoptionRate}%` },
              { label: "Documents available", value: portal.documentsAvailable },
              { label: "Invoices visible", value: portal.invoicesVisible },
              {
                label: "Invitations accepted",
                value: portal.invitationsAccepted.currentPeriodCount,
                indicator: <GrowthIndicator metric={portal.invitationsAccepted} label="Invitation acceptance" />,
              },
              { label: "Portal activity", value: portal.portalRelatedActivity },
            ]}
          />
        )}

        <ChartsSection id="analytics-portal-trends" title="Portal trends">
          <ChartPanel title="Portal user growth" chart={<GrowthLineChart label="Portal users" series={portalUserGrowthSeries} />} />
          <ChartPanel
            title="Invitations: sent vs. accepted"
            chart={
              <ActivityStackedBarChart
                label="Portal invitations"
                series={portalInvitationSeries}
                createdWord="sent"
                completedLabel="Accepted"
                openLabel="Not yet accepted"
              />
            }
          />
        </ChartsSection>

        <div className="max-w-xs">
          <ComparisonBarChart label="Invitations accepted" metric={portal.invitationsAccepted} />
        </div>
      </div>
    </section>
  );
}
