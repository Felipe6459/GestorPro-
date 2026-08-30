import type { ReactNode } from "react";

/**
 * Design/polish — the shared read-only label/value display, adopted first
 * by Settings/Company's own non-owner view (`(dashboard)/settings/company/
 * page.tsx`), which previously hand-rolled the exact same `<dl>`/`<dt>`/
 * `<dd>` markup with no long-content wrap protection at all — the one P2
 * consistency gap the design audit found: Platform Admin's own read-only
 * `Field`/`DetailSection` (`src/components/platform-admin/detail-section.tsx`)
 * already had that protection, the tenant-facing app didn't.
 *
 * Deliberately its own primitive here, not a reuse of Platform Admin's
 * `Field` — that component is tightly coupled to `DetailSection`'s own
 * landmark/heading wrapper (every one of its callers renders it inside a
 * `<section aria-labelledby>`), which this app's tenant-facing read-only
 * blocks don't use and don't need. Forcing that coupling apart to share
 * one component would be a larger, riskier change than this PR's own
 * scope; the two stay separate, matching-in-spirit implementations rather
 * than one artificially shared one. `wrap-anywhere` on the value and the
 * `grid grid-cols-1 gap-4 sm:grid-cols-2` layout are intentionally the
 * same convention both already independently arrived at.
 *
 * `DefinitionItem`'s `value` is `ReactNode`, not `string` — same reasoning
 * as `RecordCardField`/Platform Admin's `Field`: a future caller may need
 * to render something other than plain text (a badge, a link) without
 * this component changing.
 *
 * Never editable — no input, no button, no form. A read-only display only;
 * see `FormField`/`FormLabel` (`src/components/ui/form-field.tsx`) for the
 * editable-field equivalent.
 */
export function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</dl>;
}

export function DefinitionItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-text-muted text-xs font-medium">{label}</dt>
      <dd className="text-text-primary mt-0.5 wrap-anywhere text-sm">{value}</dd>
    </div>
  );
}
