import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

export function ListPageSkeleton({
  columns = 5,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-20" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className={`mt-6 overflow-hidden ${CARD_SURFACE_CLASSES}`}>
        <div className="border-border-default bg-surface-recessed h-10 border-b" />
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="border-border-subtle flex items-center gap-6 border-b px-4 py-4 last:border-0"
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton key={colIndex} className="h-4 w-full max-w-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
