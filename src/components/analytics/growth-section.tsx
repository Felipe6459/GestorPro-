import type { GrowthMetric } from "@/lib/analytics/types";

/**
 * Text-only direction indicator — no sparkline/chart (Stage 1 scope, see
 * docs/analytics-architecture.md §9). `null` (no prior-period data) is
 * its own, explicit "—" state rather than being rendered as 0% or hidden,
 * so a brand-new organization's growth row is never misread as "flat".
 */
function GrowthValue({ metric }: { metric: GrowthMetric }) {
  if (metric.changePercent === null) {
    return <span className="text-gray-400">No prior-period data</span>;
  }

  const isPositive = metric.changePercent > 0;
  const isNegative = metric.changePercent < 0;
  const tone = isPositive ? "text-green-700" : isNegative ? "text-red-700" : "text-gray-500";
  const sign = isPositive ? "+" : "";

  return (
    <span className={tone}>
      {sign}
      {metric.changePercent}%
    </span>
  );
}

function GrowthRow({ label, metric }: { label: string; metric: GrowthMetric }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">
          {metric.currentPeriodCount} this period vs {metric.previousPeriodCount} previous
        </p>
      </div>
      <div className="text-sm font-medium">
        <GrowthValue metric={metric} />
      </div>
    </div>
  );
}

export function GrowthSection({
  clientGrowth,
  projectGrowth,
  taskGrowth,
}: {
  clientGrowth: GrowthMetric;
  projectGrowth: GrowthMetric;
  taskGrowth: GrowthMetric;
}) {
  return (
    <section aria-labelledby="analytics-growth-heading" className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 id="analytics-growth-heading" className="text-base font-semibold text-gray-900">
        Growth
      </h2>
      <div className="mt-2 divide-y divide-gray-100">
        <GrowthRow label="Clients" metric={clientGrowth} />
        <GrowthRow label="Projects" metric={projectGrowth} />
        <GrowthRow label="Tasks" metric={taskGrowth} />
      </div>
    </section>
  );
}
