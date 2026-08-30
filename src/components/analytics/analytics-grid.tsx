import type { ReactNode } from "react";
import { AnalyticsCard } from "./analytics-card";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

export type AnalyticsGridMetric = { label: string; value: ReactNode; indicator?: ReactNode; sparkline?: ReactNode };

/**
 * Analytics Stage 2. Three breakpoints (2/3/4 columns) — verified against
 * mobile (375px), tablet (768px), and desktop (1280px) viewports (see the
 * Stage 2 report's own responsive findings); never a fixed column count
 * that would force horizontal scrolling on a narrow viewport.
 */
export function AnalyticsGrid({
  id,
  title,
  metrics,
}: {
  id: string;
  title: string;
  metrics: AnalyticsGridMetric[];
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={`p-5 ${CARD_SURFACE_CLASSES}`}>
      <h2 id={`${id}-heading`} className="text-text-primary text-base font-semibold">
        {title}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <AnalyticsCard key={metric.label} label={metric.label} value={metric.value} indicator={metric.indicator} sparkline={metric.sparkline} />
        ))}
      </div>
    </section>
  );
}
