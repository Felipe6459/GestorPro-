"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatBucketLabel } from "@/lib/analytics/calculations/format-bucket-label";
import type { DualChartSeries } from "@/lib/analytics/types";
import { ChartEmptyState } from "./chart-empty-state";

/**
 * Analytics Stage 3 ("stacked charts where appropriate" — Task/Invoice
 * activity). Each bucket is one bar, stacked into two segments:
 * "completed" (the darker segment) and "still open" (`created - completed`,
 * the lighter segment) — so the bar's total height is always exactly
 * `created` for that bucket, and the stacked split reads as "of what was
 * created, how much is already done" at a glance. "completed" here means
 * whatever the caller's own series defines it as (Task: `status = DONE`;
 * Invoice: `paidAt IS NOT NULL` — see queries/time-series.ts).
 */
export function ActivityStackedBarChart({ label, series }: { label: string; series: DualChartSeries }) {
  const totalCreated = series.points.reduce((sum, p) => sum + p.created, 0);
  const totalCompleted = series.points.reduce((sum, p) => sum + p.completed, 0);
  if (totalCreated === 0 && totalCompleted === 0) {
    return <ChartEmptyState label={label} />;
  }

  const data = series.points.map((p) => ({
    label: formatBucketLabel(p.bucketStart, series.unit),
    completed: p.completed,
    // Never negative: a bucket's "completed" count can exceed its own
    // "created" count (something created in an earlier bucket was
    // completed in this one) — the stacked bar only ever shows this
    // bucket's own still-open remainder, clamped at 0, never a
    // visually-broken negative segment.
    open: Math.max(0, p.created - p.completed),
  }));

  return (
    <div role="img" aria-label={`${label}: ${totalCreated} created, ${totalCompleted} completed`} className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} accessibilityLayer margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} width={28} />
          <Tooltip cursor={{ fill: "#f9fafb" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="completed" name="Completed" stackId="activity" fill="#111827" radius={[0, 0, 0, 0]} />
          <Bar dataKey="open" name="Still open" stackId="activity" fill="#d1d5db" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
