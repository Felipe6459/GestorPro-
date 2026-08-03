"use client";

import { useTransition } from "react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/(dashboard)/actions";
import { NotificationItem } from "./notification-item";
import type { NotificationBellItem } from "./notification-bell";

export function NotificationDropdown({
  notifications,
  hasUnread,
  onNavigate,
}: {
  notifications: NotificationBellItem[];
  hasUnread: boolean;
  onNavigate: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleMarkAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  }

  function handleMarkOne(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <span className="text-sm font-semibold text-gray-900">Notifications</span>
        {hasUnread && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleMarkAll}
            className="rounded text-xs font-medium text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark all as read
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
          {notifications.map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              onMarkRead={() => handleMarkOne(item.id)}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
