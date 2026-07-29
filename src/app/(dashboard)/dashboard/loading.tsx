import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-10">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-gray-200 bg-white p-5"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div>
        <Skeleton className="h-5 w-32" />
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-lg border border-gray-200 bg-white p-6"
            >
              <Skeleton className="h-4 w-28" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, itemIndex) => (
                  <Skeleton key={itemIndex} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
