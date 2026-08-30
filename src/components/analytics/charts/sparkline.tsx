"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { ChartSeries } from "@/lib/analytics/types";

/**
 * Analytics Stage 3 ("sparklines: clients; projects; tasks; invoices").
 * Deliberately minimal — no axes, no tooltip, no legend, no
 * `accessibilityLayer` (a decorative trend glyph, not an interactive
 * chart of its own): the real, accessible chart for the same series
 * already exists below the fold (growth-line-chart.tsx /
 * activity-stacked-bar-chart.tsx), reachable by the same keyboard
 * navigation that reaches the rest of the page. This is `aria-hidden` for
 * exactly that reason — a screen reader already gets the same
 * information from the KPI card's own numeric value and, for Growth
 * cards, from GrowthIndicator's own `aria-label`.
 */
// Design System Batch 4 — literal hex replaced with a live CSS custom-
// property reference. Recharts renders `stroke`/`fill` as raw SVG
// presentation attributes, and SVG accepts `var(--token)` there exactly
// like any other CSS color value — so this stays reactive to the
// resolved `data-theme` with no client-side theme-watching logic at all.
// `--accent` (not a literal graphite ink) — the app's own restrained
// Indigo, consistent with every other single-series "the org's own
// metric" chart on this page (see growth-line-chart.tsx/activity-
// stacked-bar-chart.tsx/comparison-bar-chart.tsx, same default).
export function Sparkline({ series, color = "var(--accent)" }: { series: ChartSeries; color?: string }) {
  const data = series.points.map((p) => ({ count: p.count }));
  const hasActivity = series.points.some((p) => p.count > 0);

  if (!hasActivity) {
    return null;
  }

  return (
    <div aria-hidden="true" className="mt-2 h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area type="monotone" dataKey="count" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.08} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
