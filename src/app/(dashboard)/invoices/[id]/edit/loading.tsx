import { RouteLoadingAnnouncement, EditPageHeaderSkeleton, FormCardSkeleton } from "@/components/ui/page-loading";

/** Mirrors EditInvoicePage's own shell: `mx-auto max-w-2xl`, title+Back header, one bordered card (draft form or read-only view + attachments). */
export default function EditInvoiceLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      <RouteLoadingAnnouncement label="Loading invoice" />
      <EditPageHeaderSkeleton />
      <FormCardSkeleton fields={6} />
    </div>
  );
}
