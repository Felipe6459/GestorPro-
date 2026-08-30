"use client";

import { useErrorBoundaryLogging } from "@/components/ui/segment-error-state";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorBoundaryLogging(error);

  return (
    <div className="border-border-strong bg-surface flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <h2 className="text-text-primary text-lg font-semibold">
        Something went wrong
      </h2>
      <p className="text-text-secondary mt-2 max-w-sm text-sm">
        We couldn&apos;t load this page. Please try again.
      </p>
      <Button type="button" onClick={() => reset()} className="mt-4">
        Try again
      </Button>
    </div>
  );
}
