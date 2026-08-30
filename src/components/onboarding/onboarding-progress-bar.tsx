/**
 * Library-free progress bar (Stage 3 task §8/§18 — no third-party charting
 * package, only existing Tailwind utilities). `role="progressbar"` +
 * `aria-valuenow`/min/max makes the percent available to assistive tech
 * without relying on the adjacent visible text alone.
 *
 * Design System Batch 5 — shared by two consumers (OnboardingCard on
 * /dashboard, and Analytics' OrganizationActivitySection, migrated in
 * Batch 4) — the track/fill tokens below apply identically to both, no
 * per-consumer divergence. Track -> bg-surface-muted (a quiet recessed
 * well, not a literal gray); fill -> bg-accent (the same restrained
 * Indigo every other "the one meaningful value" fill in this app already
 * uses, e.g. the analytics stacked-bar chart's own "completed" segment).
 * Calculation/props/aria semantics are completely unchanged below.
 */
export function OnboardingProgressBar({
  completedCount,
  totalCount,
  percent,
}: {
  completedCount: number;
  totalCount: number;
  percent: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-primary font-medium">
          {completedCount} of {totalCount} complete
        </span>
        <span className="text-text-secondary">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${completedCount} of ${totalCount} complete`}
        aria-label="Onboarding progress"
        className="bg-surface-muted mt-2 h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-accent h-full rounded-full transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
