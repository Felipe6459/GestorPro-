"use client";

import Link from "next/link";
import { relativeTime } from "@/lib/notifications/relative-time";
import type { NotificationBellItem } from "./notification-bell";

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
      <p className={`text-sm ${item.isUnread ? "text-text-primary font-semibold" : "text-text-secondary"}`}>
        {item.title}
        {item.isUnread && (
          <>
            {/* bg-accent (not a literal blue) — the same restrained Indigo
                every other "the one meaningful emphasis" mark in this app
                already uses, paired with the row's own bg-accent-subtle
                wash below for one consistent unread hue. */}
            <span
              aria-hidden="true"
              className="bg-accent ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
            />
            <span className="sr-only"> (unread)</span>
          </>
        )}
      </p>
      {item.detail && <p className="text-text-muted mt-0.5 text-xs">{item.detail}</p>}
      <time dateTime={item.timestamp.toISOString()} className="text-text-muted mt-1 block text-xs">
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
          className={`focus-visible:ring-focus-ring block px-4 py-3 transition-colors hover:bg-[var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset ${
            item.isUnread ? "bg-accent-subtle" : ""
          }`}
        >
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li className={`px-4 py-3 ${item.isUnread ? "bg-accent-subtle" : ""}`}>
      {body}
      {item.isUnread && (
        <button
          type="button"
          onClick={onMarkRead}
          className="text-text-secondary hover:text-text-primary focus-visible:ring-focus-ring mt-1.5 rounded text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Mark as read
        </button>
      )}
    </li>
  );
}
