import { RouteLoadingAnnouncement, PageHeadingSkeleton, TableRowsSkeleton } from "@/components/ui/page-loading";

/** Mirrors NotificationPreferencesPage's own shell: title+subtitle+Reset-button header, then the notification-type/in-app/email table. */
export default function NotificationSettingsLoading() {
  return (
    <div>
      <RouteLoadingAnnouncement label="Loading notification preferences" />
      <PageHeadingSkeleton withAction />
      <TableRowsSkeleton columns={3} rows={6} />
    </div>
  );
}
