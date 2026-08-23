"use client";

import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";

/**
 * Product UI/UX PR 2 — the shared in-place error-recovery presentation
 * adopted by the two segment-scoped boundaries this PR adds
 * (`(platform-admin)/error.tsx`, `portal/(app)/error.tsx`). Mirrors
 * `(dashboard)/error.tsx`'s own established in-place-recovery pattern
 * (a dashed-border card replacing only the page content, keeping the
 * surrounding layout/nav chrome intact) — deliberately NOT adopted by
 * that file or by `(dashboard)/analytics/error.tsx`/`(auth)/error.tsx` in
 * this PR: they already work correctly today and refactoring them is out
 * of this PR's scope.
 *
 * NEVER renders `error.message`, `error.stack`, `error.cause`,
 * `error.digest`, or any stringified/serialized form of `error` — the
 * `error` prop exists only so `console.error(error)` can report it to the
 * browser console (the same convention every existing error.tsx in this
 * repo already uses — not a new logging mechanism), never to be rendered.
 */
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

  useEffect(() => {
    console.error(error);
  }, [error]);

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
