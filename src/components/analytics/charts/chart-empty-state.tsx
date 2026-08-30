/**
 * Analytics Stage 3. Shown by an individual chart when its own series has
 * zero activity across every bucket in the window — distinct from
 * analytics-empty-state.tsx (Stage 2), which replaces the whole Overview
 * section only when an organization has no data at all. This one covers
 * the narrower case: a single dimension (e.g. Projects) with real
 * activity elsewhere on the page but nothing in the selected range.
 */
export function ChartEmptyState({ label }: { label: string }) {
  return (
    // Design System Batch 4 — bg-surface added, same "dashed border had no
    // fill of its own" fix EmptyState/SegmentErrorState already needed.
    <div className="border-border-default bg-surface flex h-48 w-full flex-col items-center justify-center rounded-md border border-dashed text-center">
      <p className="text-text-muted text-sm">Not enough data yet for {label.toLowerCase()}.</p>
    </div>
  );
}
