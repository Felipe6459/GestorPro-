"use client";

import { SegmentErrorState } from "@/components/ui/segment-error-state";

/**
 * Product UI/UX PR 2 — the Client Portal's own segment-scoped error
 * boundary. Sibling to `portal/(app)/layout.tsx`, so it wraps every Portal
 * page (overview, Invoices, Invoice detail, Projects, Project detail,
 * Profile) and their own `loading.tsx` files in a React error boundary —
 * an unhandled render/data error in any of those now recovers in place,
 * with the Portal header/nav still intact, instead of falling through to
 * the root `global-error.tsx` (a full `<html>` replacement that loses all
 * navigation). `portal/login`, `portal/signup`, `portal/forgot-password`,
 * and `portal/reset-password` are siblings of the `(app)` group, not its
 * children (see `portal/(app)/layout.tsx`'s own doc comment on exactly
 * this point) — this boundary correctly never wraps them.
 *
 * HONEST COVERAGE LIMIT (verified against this repo's installed Next.js
 * docs, node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.md): "error.js... does not wrap the layout.js
 * ... above it in the same segment." This boundary therefore does NOT
 * catch an exception thrown inside `portal/(app)/layout.tsx` itself
 * (where the portal-identity/session resolution runs) — only in the
 * pages it renders as `children`. That gap was closed separately, not by
 * this file: Stability Correction F2 (PR #102) added `src/app/error.tsx`,
 * a root-level sibling of `src/app/layout.tsx` that wraps every nested
 * layout beneath it — including `portal/(app)/layout.tsx` — in its own
 * boundary. A genuine, unexpected failure during this layout's identity
 * resolution now recovers via that root boundary (a full `<html>`
 * replacement, `global-error.tsx`'s own chrome-less presentation) rather
 * than this segment's own in-place recovery UI — see `src/app/error.tsx`'s
 * own doc comment for the full account. Only a failure thrown by
 * `src/app/layout.tsx` itself remains `global-error.tsx`'s responsibility.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentErrorState error={error} reset={reset} description="We couldn't load this page. Please try again." />;
}
