/**
 * Analytics Stage 1 — foundation-only display: a label and a number, no
 * chart, no sparkline (explicitly out of scope for this stage — see
 * docs/analytics-architecture.md §9's "Stage 2+" list).
 */
export function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
    </div>
  );
}
