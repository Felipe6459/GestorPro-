"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatBucketLabel } from "@/lib/analytics/calculations/format-bucket-label";
import type { ChartSeries } from "@/lib/analytics/types";
import { ChartEmptyState } from "./chart-empty-state";

/**
 * Analytics Stage 3. Client Component (Recharts needs the DOM/canvas —
 * see docs/analytics-architecture.md §11 for why this file, and every
 * other file in this directory, starts with `"use client"`) fed
 * already-aggregated data computed entirely server-side
 * (queries/time-series.ts) — this component only ever formats and draws
 * points it's given, never fetches, sums, or buckets anything itself.
 *
 * `accessibilityLayer` (Recharts' own built-in keyboard/screen-reader
 * support: Tab focuses the chart, arrow keys move between data points,
 * each point is announced) is the reason this library was chosen over
 * lower-level alternatives that would need that built by hand — see the
 * architecture doc's own "Library selection" section.
 */
// Design System Batch 4 — see sparkline.tsx's own comment: literal hex
// replaced with live CSS custom-property references, valid directly as
// SVG presentation-attribute values, so every color here tracks
// `data-theme` with no theme-watching JS. Grid/axis stroke maps to
// --border-default (#E5E7EB in Light — an exact match for the literal
// this replaces); tick fill maps to --text-muted (#6B7280 — likewise an
// exact match). Tooltip contentStyle gets an explicit opaque
// background/text/border (Recharts' own default tooltip background is
// white, which would float unreadably over a Dark card without this).
export function GrowthLineChart({ label, series, color = "var(--accent)" }: { label: string; series: ChartSeries; color?: string }) {
  const total = series.points.reduce((sum, p) => sum + p.count, 0);
  if (total === 0) {
    return <ChartEmptyState label={label} />;
  }

  const data = series.points.map((p) => ({
    label: formatBucketLabel(p.bucketStart, series.unit),
    count: p.count,
  }));

  return (
    <div role="img" aria-label={`${label} over time, ${total} total`} className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} accessibilityLayer margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--border-default)" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} width={28} />
          <Tooltip
            cursor={{ stroke: "var(--border-default)" }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--surface)",
              color: "var(--text-primary)",
            }}
          />
          <Line type="monotone" dataKey="count" name={label} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
