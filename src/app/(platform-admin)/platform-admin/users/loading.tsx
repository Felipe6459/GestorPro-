import { ListPageSkeleton } from "@/components/ui/list-page-skeleton";
import { RouteLoadingAnnouncement } from "@/components/ui/page-loading";

/**
 * Platform Admin Users Explorer loading state. Deliberately mirrors
 * organizations/loading.tsx's own pattern exactly — same ListPageSkeleton
 * primitive, same RouteLoadingAnnouncement pairing — since Users is the
 * same "title + table" list-page shape, just with 4 real columns
 * (Name, Email, Organizations, Created) instead of 7. Neither this file
 * nor its Organizations sibling skeletons the SearchFilterBar or
 * Pagination areas; ListPageSkeleton's own title+table shape is already
 * the established convention for this class of page.
 *
 * This was previously forbidden by route-loading-adoption-contract.
 * test.ts (see that file's own updated comment): Users was a
 * synchronous placeholder shell with no async work at all when that
 * prohibition was written, so a loading.tsx would have been dead code.
 * PR #127 replaced the shell with a real, DB-backed paginated read
 * (listUsers()), making a loading state genuinely useful — the same
 * real async shape organizations/loading.tsx already covers.
 */
export default function PlatformAdminUsersLoading() {
  return (
    <>
      <RouteLoadingAnnouncement label="Loading users" />
      <ListPageSkeleton columns={4} />
    </>
  );
}
