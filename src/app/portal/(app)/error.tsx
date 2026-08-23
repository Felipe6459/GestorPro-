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
 * 16.2.12 docs, node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.md): "error.js... does not wrap the layout.js
 * ... above it in the same segment." This boundary therefore does NOT
 * catch an exception thrown inside `portal/(app)/layout.tsx` itself
 * (where the portal-identity/session resolution runs) — only in the
 * pages it renders as `children`. A genuine, unexpected failure during
 * that identity resolution (as opposed to its own ordinary redirect
 * behavior) still falls through to `global-error.tsx` exactly as before
 * this PR. Moving that check to close this gap is a materially different,
 * riskier change to existing authentication code and is deliberately out
 * of this PR's scope.
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
