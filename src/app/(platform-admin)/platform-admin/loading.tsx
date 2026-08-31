import { Skeleton } from "@/components/ui/skeleton";
import { RouteLoadingAnnouncement } from "@/components/ui/page-loading";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

/**
 * Platform Admin loading-state completeness (primary tier). Mirrors the
 * real Dashboard page.tsx's own three regions — the KPI grid (9 cards,
 * `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`), the Registrations mini-
 * grid (2 cards), and the Newest organizations list — closely enough to
 * avoid a jarring transition, the same "match the real layout, not a
 * generic placeholder" discipline (dashboard)/dashboard/loading.tsx
 * already established for this page's own tenant-facing twin (this page's
 * own doc comment says it "reuses (dashboard)/dashboard/page.tsx's own
 * MetricCard grid convention verbatim" — this loading state completes
 * that reuse).
 *
 * This file sits at `platform-admin/loading.tsx` (a sibling of
 * `platform-admin/page.tsx`, the Dashboard route itself) — deliberately
 * NOT `(platform-admin)/loading.tsx` (the route-group root one level up,
 * which would apply to every route in this group, including Users, and
 * is explicitly forbidden by route-loading-adoption-contract.test.ts).
 */
export default function PlatformAdminDashboardLoading() {
  return (
    <div className="space-y-8">
      <RouteLoadingAnnouncement label="Loading platform dashboard" />

      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className={`p-5 ${CARD_SURFACE_CLASSES}`}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-12" />
          </div>
        ))}
      </div>

      <div>
        <Skeleton className="h-5 w-36" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:max-w-md">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className={`p-5 ${CARD_SURFACE_CLASSES}`}>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-7 w-10" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="h-5 w-44" />
        <div className={`mt-4 overflow-hidden ${CARD_SURFACE_CLASSES}`}>
          <div className="divide-border-default divide-y">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center justify-between gap-3 px-6 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
