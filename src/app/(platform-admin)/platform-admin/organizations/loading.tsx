import { ListPageSkeleton } from "@/components/ui/list-page-skeleton";
import { RouteLoadingAnnouncement } from "@/components/ui/page-loading";

export default function PlatformAdminOrganizationsLoading() {
  return (
    <>
      <RouteLoadingAnnouncement label="Loading organizations" />
      <ListPageSkeleton columns={7} />
    </>
  );
}
