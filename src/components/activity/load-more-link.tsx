import Link from "next/link";

// Design System Batch 4 — this component is shared by 3 consumers:
// Activity's own list (this batch's scope), the Comments family's "Load
// earlier comments" (already migrated, Batch 3), and Notifications'
// inbox (still raw-light, out of this batch's scope). This is the same
// narrow, self-contained, single-className-string fix as Batch 1/2's
// EmptyState/SegmentErrorState — safe for every consumer regardless of
// its own page's migration status, so it's fixed here rather than left
// as a genuine cross-cutting regression for Activity. Passive effect on
// Notifications' still-unmigrated page is disclosed in the Batch 4 PR
// description, not silently expanded scope.
const LOAD_MORE_LINK_CLASSES =
  "border-border-strong bg-surface text-text-primary focus-visible:ring-focus-ring rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

/**
 * Pure — no I/O, no React — so the query-param merging logic (does the
 * next-page cursor get added without disturbing whatever else is already
 * in `params`? does a caller-supplied `cursorParam` actually change which
 * key gets set?) is directly unit-testable without rendering anything.
 */
export function buildLoadMoreHref(
  basePath: string,
  params: Record<string, string>,
  cursor: string,
  cursorParam: string = "cursor",
): string {
  const usp = new URLSearchParams(params);
  usp.set(cursorParam, cursor);
  return `${basePath}?${usp.toString()}`;
}

/**
 * A plain GET link carrying the currently-active filters forward plus the
 * next-page cursor — no client-side state, consistent with the rest of
 * this project's pagination (see components/list/pagination.tsx).
 *
 * `cursorParam` defaults to "cursor" (Activity/Notifications' own param
 * name) but is configurable so a page with more than one independently-
 * paginated list — e.g. a Project/Task edit page whose own searchParams
 * are unrelated to its Comments section — can give each list its own,
 * non-colliding query param (see docs/comments-architecture.md §10,
 * "commentsCursor") without this component needing to know anything
 * about what else lives in the URL; `params` still carries every other
 * already-active param forward untouched.
 */
export function LoadMoreLink({
  basePath,
  params,
  cursor,
  cursorParam = "cursor",
  label = "Load more",
}: {
  basePath: string;
  params: Record<string, string>;
  cursor: string;
  cursorParam?: string;
  label?: string;
}) {
  return (
    <Link
      href={buildLoadMoreHref(basePath, params, cursor, cursorParam)}
      className={LOAD_MORE_LINK_CLASSES}
    >
      {label}
    </Link>
  );
}
