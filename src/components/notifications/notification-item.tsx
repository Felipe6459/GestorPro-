"use client";

import Link from "next/link";
import type { NotificationBellItem } from "./notification-bell";

function relativeTime(date: Date): string {
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationItem({
  item,
  onMarkRead,
  onNavigate,
}: {
  item: NotificationBellItem;
  onMarkRead: () => void;
  onNavigate: () => void;
}) {
  const body = (
    <>
      <p className={`text-sm ${item.isUnread ? "font-semibold text-gray-900" : "text-gray-700"}`}>
        {item.title}
        {item.isUnread && (
          <>
            <span
              aria-hidden="true"
              className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-600 align-middle"
            />
            <span className="sr-only"> (unread)</span>
          </>
        )}
      </p>
      {item.detail && <p className="mt-0.5 text-xs text-gray-500">{item.detail}</p>}
      <time dateTime={item.timestamp.toISOString()} className="mt-1 block text-xs text-gray-400">
        {relativeTime(item.timestamp)}
      </time>
    </>
  );

  // Preferred UX (Variant A): a click on an unread item with a safe link
  // marks it read and navigates in the same gesture. Not every notification
  // has one (see format-notification.ts's buildLink allowlist) — those
  // never get a fake/guessed URL, just a standalone "Mark as read" button.
  if (item.link) {
    return (
      <li>
        <Link
          href={item.link}
          onClick={() => {
            if (item.isUnread) onMarkRead();
            onNavigate();
          }}
          className={`block px-4 py-3 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black ${
            item.isUnread ? "bg-blue-50/60" : ""
          }`}
        >
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li className={`px-4 py-3 ${item.isUnread ? "bg-blue-50/60" : ""}`}>
      {body}
      {item.isUnread && (
        <button
          type="button"
          onClick={onMarkRead}
          className="mt-1.5 rounded text-xs font-medium text-gray-600 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Mark as read
        </button>
      )}
    </li>
  );
}
