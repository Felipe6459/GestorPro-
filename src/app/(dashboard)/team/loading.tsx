import { RouteLoadingAnnouncement, PageHeadingSkeleton, FormCardSkeleton, TableRowsSkeleton } from "@/components/ui/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors TeamPage's own shell: `space-y-10`, title+subtitle+Leave-button header, Members table, Pending invitations table, Invite-a-member card. */
export default function TeamLoading() {
  return (
    <div className="space-y-10">
      <RouteLoadingAnnouncement label="Loading team" />
      <PageHeadingSkeleton withAction />

      <section>
        <Skeleton className="h-5 w-24" />
        <TableRowsSkeleton columns={5} rows={3} />
      </section>

      <section>
        <Skeleton className="h-5 w-40" />
        <TableRowsSkeleton columns={5} rows={2} />
      </section>

      <section>
        <Skeleton className="h-5 w-32" />
        <div className="mt-4 max-w-md">
          <FormCardSkeleton fields={1} />
        </div>
      </section>
    </div>
  );
}
