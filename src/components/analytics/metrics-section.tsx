import { MetricCard } from "./metric-card";

export function MetricsSection({
  id,
  title,
  metrics,
}: {
  id: string;
  title: string;
  metrics: { label: string; value: number | string }[];
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 id={`${id}-heading`} className="text-base font-semibold text-gray-900">
        {title}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>
    </section>
  );
}
