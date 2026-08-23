import { RouteLoadingAnnouncement, PageHeadingSkeleton, FormCardSkeleton } from "@/components/ui/page-loading";

/** Mirrors PaymentDetailsPage's own shell: `mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8`, title+subtitle header, one bordered card (payment-details form). */
export default function PaymentSettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <RouteLoadingAnnouncement label="Loading payment details" />
      <PageHeadingSkeleton />
      <div className="mt-6">
        <FormCardSkeleton fields={4} />
      </div>
    </div>
  );
}
