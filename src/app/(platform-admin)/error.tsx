"use client";

import { SegmentErrorState } from "@/components/ui/segment-error-state";

/**
 * Product UI/UX PR 2 — Platform Admin's own segment-scoped error boundary.
 * Sibling to `(platform-admin)/layout.tsx`, so it wraps every Platform
 * Admin page (dashboard, Organizations, Users, Configuration) and their
 * own `loading.tsx`/`not-found.tsx` files in a React error boundary — an
 * unhandled render/data error in any of those now recovers in place, with
 * the Platform Admin header/nav still intact, instead of falling through
 * to the root `global-error.tsx` (a full `<html>` replacement that loses
 * all navigation).
 *
 * HONEST COVERAGE LIMIT (verified against this repo's installed Next.js
 * 16.2.12 docs, node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.md): "error.js... does not wrap the layout.js
 * ... above it in the same segment." This boundary therefore does NOT
 * catch an exception thrown inside `(platform-admin)/layout.tsx` itself
 * (where `requirePlatformAdmin()` runs) — only in the pages/nested
 * layouts it renders as `children`. A genuine, unexpected failure inside
 * `requirePlatformAdmin()` (as opposed to its own ordinary redirect
 * behavior) still falls through to `global-error.tsx` exactly as before
 * this PR. Moving that auth check to close this gap is a materially
 * different, riskier change to existing authorization code and is
 * deliberately out of this PR's scope.
 */
export default function PlatformAdminError({
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
      description="We couldn't load this Platform Admin page. Please try again."
    />
  );
}
