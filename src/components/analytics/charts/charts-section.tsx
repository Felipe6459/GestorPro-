import type { ReactNode } from "react";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

/**
 * Analytics Stage 3. Same section/heading shell as AnalyticsGrid, sized
 * for chart panels instead of stat cards — one or two columns depending
 * on how many charts are passed, so a single full-width chart (e.g.
 * Organization Activity) never gets squeezed into a half-width column
 * next to nothing.
 */
export function ChartsSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className={`p-5 ${CARD_SURFACE_CLASSES}`}>
      <h2 id={`${id}-heading`} className="text-text-primary text-base font-semibold">
        {title}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">{children}</div>
    </section>
  );
}

export function ChartPanel({ title, chart }: { title: string; chart: ReactNode }) {
  return (
    <div>
      <p className="text-text-primary text-sm font-medium">{title}</p>
      <div className="mt-2">{chart}</div>
    </div>
  );
}
