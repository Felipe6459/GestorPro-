import { RouteLoadingAnnouncement, EditPageHeaderSkeleton, FormCardSkeleton } from "@/components/ui/page-loading";

/** Mirrors EditProjectPage's own shell: `mx-auto max-w-xl`, title+Cancel header, one bordered card (ProjectForm + attachments + comments). */
export default function EditProjectLoading() {
  return (
    <div className="mx-auto max-w-xl">
      <RouteLoadingAnnouncement label="Loading project" />
      <EditPageHeaderSkeleton />
      <FormCardSkeleton fields={5} />
    </div>
  );
}
