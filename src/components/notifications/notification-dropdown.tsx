"use client";

import { useTransition } from "react";
import Link from "next/link";
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
      <div className="border-border-subtle flex items-center justify-between border-b px-4 py-3">
        <span className="text-text-primary text-sm font-semibold">Notifications</span>
        {hasUnread && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleMarkAll}
            className="text-text-secondary hover:text-text-primary rounded text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark all as read
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="text-text-muted px-4 py-8 text-center text-sm">No notifications yet.</p>
      ) : (
        <ul className="divide-border-subtle max-h-96 divide-y overflow-y-auto">
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
      <div className="border-border-subtle border-t px-4 py-2 text-center">
        <Link
          href="/notifications"
          onClick={onNavigate}
          className="text-text-secondary hover:text-text-primary focus-visible:ring-focus-ring rounded text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
