import { formatStatusLabel } from "@/lib/format";
import { STATUS_TONES, type StatusTone } from "@/components/ui/status-badge";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

// Static class strings only — Tailwind can't see a dynamically-built
// `bg-${color}-500`, so every value here is written out in full and never
// concatenated at runtime.
//
// Design System page migration Batch 1 — the raw Tailwind palette colors
// above are replaced with the same semantic success/warning/danger/info
// tokens StatusBadge already uses for these exact STATUS_TONES categories
// (imported below, unchanged) — no new color meaning invented, just a
// tokenized presentation of the same existing mapping. neutral/muted have
// no dedicated brand color (they mean "no particular status"), so they
// use the text/border scale instead, preserving their original relative
// weight (neutral a shade more prominent than muted).
const TONE_BAR_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-text-muted",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-danger",
  muted: "bg-border-strong",
};

export type BreakdownItem = { status: string; count: number };

/**
 * Horizontal bars, one per status. Color is purely decorative — the status
 * name, count, and percentage are always rendered as text next to it, so
 * nothing here depends on color alone to be understood.
 */
export function BreakdownCard({
  title,
  items,
  labelFormatter = formatStatusLabel,
}: {
  title: string;
  items: BreakdownItem[];
  labelFormatter?: (status: string) => string;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className={`p-6 ${CARD_SURFACE_CLASSES}`}>
      <h3 className="text-text-primary text-sm font-semibold">{title}</h3>

      {total === 0 ? (
        <p className="text-text-muted mt-4 text-sm">No data yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const tone = STATUS_TONES[item.status] ?? "neutral";
            return (
              <li key={item.status}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-text-secondary">{labelFormatter(item.status)}</span>
                  <span className="text-text-muted">
                    {item.count} ({percent}%)
                  </span>
                </div>
                <div className="bg-surface-recessed mt-1 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full ${TONE_BAR_CLASSES[tone]}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
