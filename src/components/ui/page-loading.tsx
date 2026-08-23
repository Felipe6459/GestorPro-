import { Skeleton } from "@/components/ui/skeleton";

/**
 * Product UI/UX PR 4 — the shared building blocks every new route
 * `loading.tsx` composes from (Product UI/UX Design Investigation,
 * finding F5: Client/Project/Task/Invoice `[id]/edit` pages, Team,
 * Settings/*, and Portal `/profile` had no `loading.tsx` at all — a
 * blank/flash transition, unlike the list pages' existing
 * `ListPageSkeleton`). Each `loading.tsx` still supplies its own real
 * page's outer container className (e.g. `mx-auto max-w-xl`) so the
 * skeleton's layout matches the real page closely enough to reduce
 * layout shift — these are the repeated interior shapes only, not a
 * full templating system.
 *
 * Accessibility: every piece here is decorative (`Skeleton`'s own
 * `aria-hidden="true"`) and renders no focusable/interactive element.
 * The one real, non-hidden announcement per page boundary is
 * `RouteLoadingAnnouncement`, which every new `loading.tsx` renders
 * exactly once.
 */

/** The one real, non-decorative element per loading boundary — visually hidden (`sr-only`, never `aria-hidden`) so it stays in the accessibility tree. */
export function RouteLoadingAnnouncement({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

/** The `mb-6 flex items-center justify-between` title+Cancel/Back header shared by every `[id]/edit` page (Clients/Projects/Tasks/Invoices). */
export function EditPageHeaderSkeleton() {
  return (
    <div className="mb-6 flex items-center justify-between">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-14" />
    </div>
  );
}

/** The stacked title(+subtitle), optional trailing action-button, header shape shared by Team/Settings/Portal Profile. */
export function PageHeadingSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      {withAction && <Skeleton className="h-9 w-32" />}
    </div>
  );
}

/** One label-bar + input-bar pair — a single form field's loading placeholder. */
function FieldSkeleton() {
  return (
    <div>
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="mt-2 h-9 w-full" />
    </div>
  );
}

/**
 * The bordered white card (`rounded-lg border border-gray-200 bg-white
 * p-6`) every edit form, Settings form, and Portal Profile section
 * renders as — optionally with its own in-card heading (Portal Profile's
 * three sections each have one; the four `[id]/edit` pages don't), N
 * field placeholders, and an optional trailing submit-button bar (Portal
 * Profile's read-only sections have no submit control).
 */
export function FormCardSkeleton({
  fields = 4,
  heading = false,
  withButton = true,
}: {
  fields?: number;
  heading?: boolean;
  withButton?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {heading && <Skeleton className="h-4 w-24" />}
      <div className={heading ? "mt-4 space-y-4" : "space-y-4"}>
        {Array.from({ length: fields }, (_, i) => (
          <FieldSkeleton key={i} />
        ))}
      </div>
      {withButton && <Skeleton className="mt-6 h-9 w-32" />}
    </div>
  );
}

/**
 * A bordered table-shaped block — a thin header strip followed by `rows`
 * rows of `columns` cell placeholders each, matching the same
 * proportions `ListPageSkeleton`
 * (`src/components/ui/list-page-skeleton.tsx`) already uses. Deliberately
 * standalone (not that component's own page-header row) — Team's Members
 * and Pending invitations sections each render their own `<h2>`
 * subheading directly, outside this piece.
 */
export function TableRowsSkeleton({ columns, rows = 4 }: { columns: number; rows?: number }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="h-10 border-b border-gray-200 bg-gray-50" />
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-6 border-b border-gray-100 px-4 py-4 last:border-0">
          {Array.from({ length: columns }, (_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 w-full max-w-24" />
          ))}
        </div>
      ))}
    </div>
  );
}
