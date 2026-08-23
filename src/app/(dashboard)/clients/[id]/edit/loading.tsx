import { RouteLoadingAnnouncement, EditPageHeaderSkeleton, FormCardSkeleton } from "@/components/ui/page-loading";

/** Mirrors EditClientPage's own shell: `mx-auto max-w-xl`, title+Cancel header, one bordered card (ClientForm + attachments + portal access). */
export default function EditClientLoading() {
  return (
    <div className="mx-auto max-w-xl">
      <RouteLoadingAnnouncement label="Loading client" />
      <EditPageHeaderSkeleton />
      <FormCardSkeleton fields={6} />
    </div>
  );
}
