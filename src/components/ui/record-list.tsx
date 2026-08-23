import { ReactNode } from "react";

/**
 * Product UI/UX PR 3 — the shared mobile stacked-card presentation for a
 * list page's records, adopted alongside the existing `<Table>` (never
 * replacing it). Desktop/tablet (`md:` and up) keeps the real semantic
 * `<table>` unchanged; below `md` the table is hidden (`className="hidden
 * md:block"` on its own wrapper, applied by each page) and this card list
 * renders instead — the same data, mapped a second time in JSX, never
 * fetched or computed twice.
 *
 * Deliberately NOT a general-purpose table framework (out of this PR's
 * scope) — three small, composable pieces only: `RecordCardList` (the
 * `<ul>` wrapper, itself `md:hidden`), `RecordCard` (one `<li>` per
 * record), and `RecordCardField` (one real, DOM-order label/value pair —
 * never a CSS `::before`/`content: attr()` generated label, which is not
 * reliably exposed to every assistive technology/copy-paste path; a real
 * text node is unambiguous everywhere). `RecordCardActions` groups a
 * card's row actions using the same visual convention as
 * `TableCell`'s own `align="right"` action group.
 */

export function RecordCardList({ children }: { children: ReactNode }) {
  return <ul className="mt-6 space-y-3 md:hidden">{children}</ul>;
}

export function RecordCard({ children }: { children: ReactNode }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
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
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-1.5 last:border-b-0">
      <span className="shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span
        className={`min-w-0 max-w-[70%] text-right break-words ${
          emphasis ? "text-sm font-medium text-gray-900" : "text-sm text-gray-700"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function RecordCardActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex items-center justify-end gap-4 border-t border-gray-100 pt-3">
      {children}
    </div>
  );
}
