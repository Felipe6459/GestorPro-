import { RouteLoadingAnnouncement, PageHeadingSkeleton, FormCardSkeleton } from "@/components/ui/page-loading";

/** Mirrors CompanyProfilePage's own shell: `mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8`, title+subtitle header, one bordered card (business-identity form + logo). */
export default function CompanySettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <RouteLoadingAnnouncement label="Loading business identity settings" />
      <PageHeadingSkeleton />
      <div className="mt-6">
        <FormCardSkeleton fields={8} />
      </div>
    </div>
  );
}
