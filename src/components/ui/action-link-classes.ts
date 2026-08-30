/**
 * Design System Phase 2 — a genuine regression this phase's own Table/
 * RecordCard migration caused, found and fixed during this same PR's
 * visual verification pass (see the PR description for the full
 * before/after screenshot evidence): eleven row/detail-level "Edit" /
 * "View" / "Download PDF" links across six page files
 * (clients/invoices/projects/tasks/platform-admin/organizations list
 * pages, and the Portal invoice detail page) all hand-rolled the exact
 * same literal `text-gray-700 hover:text-gray-900` class string. That
 * color was tuned for the raw `bg-white` row it always used to sit on —
 * once Table/RecordCard's own container became `bg-surface` (this same
 * PR), that literal gray now renders at roughly 1.6:1 contrast against
 * Dark's surface (computed directly against the real hex values in
 * globals.css), i.e. functionally invisible — not merely "suboptimal,"
 * a genuine new accessibility regression, not a pre-existing one.
 *
 * This is a narrow, mechanical exception to Phase 2's own "shared
 * primitives only, no page-by-page migration" scope: the fix is a
 * byte-for-byte identical class-string swap at each of the eleven
 * existing call sites (same text, same hrefs, same icons, same DOM
 * structure) — nothing about the calling pages' layout, data, or logic
 * changes. It is reported explicitly as a scope exception in the PR
 * description, not silently folded into "shared primitive work."
 */
export const ACTION_LINK_CLASSES =
  "text-text-secondary hover:text-text-primary focus-visible:ring-focus-ring rounded text-sm font-medium transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
