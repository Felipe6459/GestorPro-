"use client";

import { SegmentErrorState } from "@/components/ui/segment-error-state";

/**
 * Stability Correction F2 — the root-level error boundary.
 *
 * Confirmed against this repo's own installed Next.js 16.2.12 docs
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-
 * conventions/error.md): "error.js wraps loading.js, not-found.js,
 * page.js, and nested layout.js files in a React error boundary. It does
 * not wrap the layout.js ... above it in the same segment. To handle
 * errors in the root layout, use global-error.js."
 *
 * Placed here, sibling to src/app/layout.tsx, this boundary wraps every
 * NESTED layout beneath the root — (dashboard)/layout.tsx,
 * (platform-admin)/layout.tsx, and portal/(app)/layout.tsx — each of
 * which performs real async auth/tenant-resolution work with no boundary
 * of its own (a segment's own error.tsx can never catch its own sibling
 * layout, per the quote above). A genuine, unexpected exception thrown by
 * any of those three now recovers in place instead of falling all the way
 * through to the chrome-less global-error.tsx.
 *
 * What this still does NOT catch: an exception thrown by
 * src/app/layout.tsx itself (a plain, synchronous component with no data
 * fetching of its own) — global-error.tsx remains, unchanged, the only
 * boundary for that one case, exactly as the docs above describe.
 *
 * What this does NOT replace: (auth)/error.tsx, (dashboard)/error.tsx,
 * (dashboard)/analytics/error.tsx, (platform-admin)/error.tsx, and
 * portal/(app)/error.tsx all remain in place, untouched — Next.js always
 * prefers the nearest, most specific matching boundary, so each of those
 * keeps catching everything inside its own pages exactly as before this
 * correction. (auth) has no layout.tsx of its own, so it was never
 * exposed to this particular gap in the first place.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentErrorState
      error={error}
      reset={reset}
      description="We couldn't load this page. Please try again."
    />
  );
}
