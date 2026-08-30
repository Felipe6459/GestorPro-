import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-12 w-64" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={`p-5 ${CARD_SURFACE_CLASSES}`}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>

      <div className={`p-6 ${CARD_SURFACE_CLASSES}`}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-7 w-28" />
        <div className="mt-6 flex h-40 items-end gap-0.5">
          {Array.from({ length: 30 }).map((_, index) => (
            <div key={index} className="bg-border-default h-full flex-1 rounded-t" />
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="h-5 w-28" />
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className={`p-6 ${CARD_SURFACE_CLASSES}`}>
              <Skeleton className="h-4 w-28" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, rowIndex) => (
                  <div key={rowIndex}>
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="mt-1 h-1.5 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`p-6 ${CARD_SURFACE_CLASSES}`}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="mt-4 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, cardIndex) => (
          <div key={cardIndex} className={`p-6 ${CARD_SURFACE_CLASSES}`}>
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div key={rowIndex}>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
