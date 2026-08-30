import { ReactNode } from "react";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

/**
 * Product UI/UX PR 3 — the shared mobile stacked-card presentation for a
 * list page's records, adopted alongside the existing `<Table>` (never
 * replacing it). Desktop (`xl:` and up) keeps the real semantic `<table>`
 * unchanged; below `xl` the table is hidden (`className="hidden
 * xl:block"` on its own wrapper, applied by each page) and this card list
 * renders instead — the same data, mapped a second time in JSX, never
 * fetched or computed twice.
 *
 * BREAKPOINT — corrected from an original `md` (768px) cutover after a
 * production defect (Tasks list: clipped Actions header, partially
 * off-screen Delete action at a widened-but-not-yet-desktop viewport).
 * Root cause: `md` is also exactly where `(dashboard)/layout.tsx`'s own
 * Sidebar becomes a fixed 224px side column — activating the desktop
 * table at the same breakpoint where the content area actually *shrinks*
 * (sidebar + its own 48px padding taken out of the viewport). Real,
 * measured content width each of the six target tables needs to render
 * without overflow (see test/e2e/responsive-list-tables-breakpoint.spec.ts's
 * own header comment for the full measurement): 584–779px, Tasks (9
 * columns) the widest. `xl` (1280px) is Tailwind's own next built-in step
 * above `lg` (1024px, itself proven insufficient for Tasks) that clears
 * every measured requirement with 229px+ of real margin — chosen over a
 * bespoke arbitrary-value breakpoint so a modest future increase in real
 * content width doesn't reopen this same gap with zero headroom.
 *
 * Deliberately NOT a general-purpose table framework (out of this PR's
 * scope) — three small, composable pieces only: `RecordCardList` (the
 * `<ul>` wrapper, itself `xl:hidden`), `RecordCard` (one `<li>` per
 * record), and `RecordCardField` (one real, DOM-order label/value pair —
 * never a CSS `::before`/`content: attr()` generated label, which is not
 * reliably exposed to every assistive technology/copy-paste path; a real
 * text node is unambiguous everywhere). `RecordCardActions` groups a
 * card's row actions using the same visual convention as
 * `TableCell`'s own `align="right"` action group.
 */

export function RecordCardList({ children }: { children: ReactNode }) {
  return <ul className="mt-6 space-y-3 xl:hidden">{children}</ul>;
}

export function RecordCard({ children }: { children: ReactNode }) {
  return (
    <li className={`p-4 text-sm ${CARD_SURFACE_CLASSES}`}>
      {children}
    </li>
  );
}

/**
 * One label/value pair. `value` accepts `ReactNode` (not just a string) so
 * a `StatusBadge`/`RoleSelect`/other existing component can be reused
 * unchanged inside a card field, exactly as it already is inside a
 * `TableCell`. `min-w-0`/`break-words` on the value side means a long
 * Invoice number, email address, or user-authored name wraps onto a
 * second line rather than forcing this card (and therefore the page)
 * wider than the viewport.
 */
export function RecordCardField({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="border-border-subtle flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0">
      <span className="text-text-muted shrink-0 text-xs font-medium">{label}</span>
      <span
        className={`min-w-0 max-w-[70%] text-right break-words ${
          emphasis ? "text-text-primary text-sm font-medium" : "text-text-secondary text-sm"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function RecordCardActions({ children }: { children: ReactNode }) {
  return (
    <div className="border-border-subtle mt-3 flex items-center justify-end gap-4 border-t pt-3">
      {children}
    </div>
  );
}
