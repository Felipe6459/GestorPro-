import { RouteLoadingAnnouncement, PageHeadingSkeleton, FormCardSkeleton } from "@/components/ui/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors PortalProfilePage's own shell: `mx-auto max-w-2xl space-y-8`, title+subtitle header, three bordered card sections (Your details, Client, Shared files) — all read-only, no submit control. */
export default function PortalProfileLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <RouteLoadingAnnouncement label="Loading profile" />
      <PageHeadingSkeleton />
      <FormCardSkeleton heading fields={2} withButton={false} />
      <FormCardSkeleton heading fields={4} withButton={false} />
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <Skeleton className="h-4 w-24" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
