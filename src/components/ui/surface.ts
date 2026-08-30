/**
 * Design System Phase 2 — the single "opaque bordered card" look shared
 * by the small primitives this phase migrates (EmptyState/ConfirmDialog
 * already have their own distinct treatment; this covers RecordCard and
 * the skeleton placeholders that mimic real table/card content shapes).
 *
 * Not yet adopted by page-level "bordered white card" sections outside
 * src/components/ui/ — an audit during this phase found 60+ page/
 * component files using the equivalent raw
 * `rounded-lg border border-gray-200 bg-white` classes directly. Sweeping
 * every one of those is a broad, page-by-page redesign explicitly out of
 * this phase's scope (see the Phase 2 PR description) — deferred to a
 * later Design System phase. This constant exists so the primitives THIS
 * phase migrates share one definition instead of several separately
 * hand-maintained copies of the same tokens, and gives that later phase
 * a ready-made value to adopt.
 */
export const CARD_SURFACE_CLASSES = "border-border-default bg-surface rounded-lg border";
