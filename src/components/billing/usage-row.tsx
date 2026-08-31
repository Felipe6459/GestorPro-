import type { UsageRowViewModel } from "@/lib/billing/view-model";

// Design System Batch 8 — matches OnboardingProgressBar's own established
// track/fill precedent (bg-surface-muted / bg-accent for "the one
// meaningful value") for NORMAL; APPROACHING/REACHED/EXCEEDED borrow the
// same warning/danger tokens StatusBadge already uses everywhere else,
// as solid fills rather than that token's own "-subtle" wash. The two
// raw ambers this replaced (amber-500 or amber-600) collapse to one
// --warning shade — a deliberate, disclosed simplification: severity is
// still fully conveyed by the STATUS_TAGS label below ("Approaching
// limit" vs "Limit reached"), never by the bar color alone.
const BAR_COLORS: Record<UsageRowViewModel["status"], string> = {
  NORMAL: "bg-accent",
  APPROACHING: "bg-warning",
  REACHED: "bg-warning",
  EXCEEDED: "bg-danger",
};

const STATUS_TAGS: Partial<Record<UsageRowViewModel["status"], { label: string; className: string }>> = {
  APPROACHING: { label: "Approaching limit", className: "bg-warning-subtle text-warning" },
  REACHED: { label: "Limit reached", className: "bg-warning-subtle text-warning" },
  EXCEEDED: { label: "Over limit", className: "bg-danger-subtle text-danger" },
};

/**
 * Billing & Subscriptions Stage 3 (this stage's own §6/§13). No arithmetic
 * happens here — every number/label/status was already decided by
 * src/lib/billing/view-model.ts + usage-presentation.ts; this component
 * only renders it.
 *
 * Unlimited rows never render role="progressbar" at all (a bar with no
 * real max would need a fabricated aria-valuemax) — they get a plain text
 * row instead, which is the row's own accessible text equivalent, not a
 * decorative fallback. Bounded rows use the row's real current/limit as
 * aria-valuenow/aria-valuemax (not the 0-100 display percentage), so an
 * EXCEEDED row's aria-valuenow genuinely exceeding aria-valuemax is real,
 * meaningful data, not a bug — the bar's own visual width is separately
 * clamped to 100% so it never overflows its track.
 */
export function UsageRow({ row }: { row: UsageRowViewModel }) {
  const tag = STATUS_TAGS[row.status];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-text-primary font-medium">{row.label}</span>
        {tag && (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tag.className}`}>
            {tag.label}
          </span>
        )}
      </div>

      <p className="text-text-muted mt-0.5 text-sm">
        {row.unlimited ? `${row.currentLabel} used` : `${row.currentLabel} of ${row.limitLabel} used`}
      </p>

      {row.unlimited ? (
        <p className="text-text-muted mt-2 text-xs">Unlimited</p>
      ) : (
        <div
          role="progressbar"
          aria-valuenow={row.current}
          aria-valuemin={0}
          aria-valuemax={row.limit ?? undefined}
          aria-label={`${row.label} usage`}
          className="bg-surface-muted mt-2 h-2 w-full overflow-hidden rounded-full"
        >
          <div
            className={`h-full rounded-full transition-all ${BAR_COLORS[row.status]}`}
            style={{ width: `${Math.min(row.percentage ?? 0, 100)}%` }}
          />
        </div>
      )}

      <span className="sr-only">{row.accessibleSummary}</span>
    </div>
  );
}
