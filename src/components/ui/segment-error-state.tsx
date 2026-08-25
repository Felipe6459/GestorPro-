"use client";

import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";

/**
 * Product UI/UX PR 2 — the shared in-place error-recovery presentation
 * adopted by `(platform-admin)/error.tsx`, `portal/(app)/error.tsx`, and
 * `src/app/error.tsx` (the root boundary, added later by Stability
 * Correction F2). `(dashboard)/error.tsx`, `(dashboard)/analytics/
 * error.tsx`, and `(auth)/error.tsx` keep their own distinct visual
 * markup/copy (mirroring this component's own established pattern
 * without literally rendering it) — consolidating their *presentation*
 * is out of scope; only the logging behavior below is now shared with
 * them (Production Observability Priority 4).
 *
 * NEVER renders `error.message`, `error.stack`, `error.cause`,
 * `error.digest`, or any stringified/serialized form of `error` — the
 * `error` prop exists only so `console.error(error)` (via
 * `useErrorBoundaryLogging` below) can report it to the browser console
 * (the same convention every existing error.tsx in this repo already
 * uses — not a new logging mechanism), never to be rendered.
 */

/**
 * Production Observability Priority 4 — the one place `console.error(error)`
 * is called for a rendered error boundary in this app. Every error.tsx
 * (this component included) calls this hook exactly once instead of
 * each maintaining its own copy of the same three-line effect —
 * consolidating a duplicated pattern, not adding a new one: every
 * boundary in this repo already called `console.error(error)` inside an
 * identical `useEffect(() => { ... }, [error])` before this change.
 *
 * `error` is passed to `console.error` exactly as received — never
 * stringified, serialized, transformed, forwarded, or enriched with any
 * additional field — and only ever runs client-side, inside a mounted
 * Client Component's effect (never during server/static rendering,
 * which never runs effects at all). No network call, beacon, mutation,
 * or external SDK exists here or anywhere this hook is used — it is the
 * exact same browser-console-only behavior every caller already had,
 * only written once.
 */
export function useErrorBoundaryLogging(error: Error): void {
  useEffect(() => {
    console.error(error);
  }, [error]);
}

export function SegmentErrorState({
  error,
  reset,
  description,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  description: string;
}) {
  const headingId = useId();

  useErrorBoundaryLogging(error);

  return (
    <div
      role="alert"
      aria-labelledby={headingId}
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-16 text-center"
    >
      <h2 id={headingId} className="text-lg font-semibold text-gray-900">
        Something went wrong
      </h2>
      <p className="mt-2 max-w-sm text-sm text-gray-600">{description}</p>
      <Button type="button" onClick={() => reset()} className="mt-4">
        Try again
      </Button>
    </div>
  );
}
