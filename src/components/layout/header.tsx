import { signOut, switchOrganizationAction } from "@/app/(dashboard)/actions";
import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { NotificationBell, type NotificationBellItem } from "@/components/notifications/notification-bell";
import { GlobalSearch } from "@/components/search/global-search";
import type { OrganizationSwitcherItem } from "@/lib/current-user";

export function Header({
  email,
  organizations,
  unreadNotificationCount,
  recentNotifications,
}: {
  email: string;
  organizations: OrganizationSwitcherItem[];
  unreadNotificationCount: number;
  recentNotifications: NotificationBellItem[];
}) {
  const activeOrganizationId = organizations.find((org) => org.isActive)?.organizationId;

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
      <OrganizationSwitcher organizations={organizations} action={switchOrganizationAction} />
      <div className="flex items-center gap-4">
        {/*
          key={activeOrganizationId} forces React to fully unmount and
          remount GlobalSearch (discarding its search state) whenever the
          active organization changes — defense-in-depth alongside the
          search dialog's own modal-blocking (see search-dialog.tsx). No
          new prop/fetch needed: `organizations` (already server-resolved
          in (dashboard)/layout.tsx) already carries the active org's id.
        */}
        <GlobalSearch key={activeOrganizationId} />
        <NotificationBell
          initialUnreadCount={unreadNotificationCount}
          initialNotifications={recentNotifications}
        />
        <span className="text-sm text-gray-600">{email}</span>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
