import { RouteLoadingAnnouncement, EditPageHeaderSkeleton, FormCardSkeleton } from "@/components/ui/page-loading";

/** Mirrors EditTaskPage's own shell: `mx-auto max-w-xl`, title+Cancel header, one bordered card (TaskForm + comments). */
export default function EditTaskLoading() {
  return (
    <div className="mx-auto max-w-xl">
      <RouteLoadingAnnouncement label="Loading task" />
      <EditPageHeaderSkeleton />
      <FormCardSkeleton fields={5} />
    </div>
  );
}
