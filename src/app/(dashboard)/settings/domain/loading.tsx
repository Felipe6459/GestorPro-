import { RouteLoadingAnnouncement, PageHeadingSkeleton, FormCardSkeleton } from "@/components/ui/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors DomainSettingsPage's own shell: `mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8`, title+subtitle header, generated-subdomain box, then the domain-settings form card. */
export default function DomainSettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <RouteLoadingAnnouncement label="Loading domain settings" />
      <PageHeadingSkeleton />
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <div className="mt-6">
        <FormCardSkeleton fields={2} />
      </div>
    </div>
  );
}
