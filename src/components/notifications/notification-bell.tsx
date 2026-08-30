"use client";

import { useRef } from "react";
import { BellIcon } from "@/components/ui/icons";
import { NotificationDropdown } from "./notification-dropdown";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";
import type { NotificationDisplayModel } from "@/lib/notifications/format-notification";

export type NotificationBellItem = NotificationDisplayModel & { id: string };

/**
 * Native <details>/<summary> disclosure, same dependency-free popover
 * pattern as OrganizationSwitcher — not a second overlay paradigm just for
 * this feature. Server-rendered initial data flows in as props from the
 * dashboard layout (see (dashboard)/layout.tsx); this component never
 * fetches on its own.
 */
export function NotificationBell({
  initialUnreadCount,
  initialNotifications,
}: {
  initialUnreadCount: number;
  initialNotifications: NotificationBellItem[];
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function close() {
    // Deferred a tick: this is also passed as the onClick for links inside
    // the dropdown (NotificationItem, "View all notifications"). Next.js's
    // Link has its own onClick that triggers the client-side navigation —
    // hiding this <details>'s content (which removeAttribute("open") does,
    // synchronously, in the same DOM tree the clicked <a> lives in) in the
    // very same tick risks running before that navigation has started,
    // rather than after. Letting the click's own handlers finish first,
    // then closing, avoids that race entirely.
    setTimeout(() => {
      const details = detailsRef.current;
      if (!details) return;
      details.removeAttribute("open");
      details.querySelector("summary")?.focus();
    }, 0);
  }

  const badgeLabel = initialUnreadCount > 99 ? "99+" : String(initialUnreadCount);

  return (
    <details
      ref={detailsRef}
      className="group relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <summary
        className="text-text-secondary focus-visible:ring-focus-ring relative flex cursor-pointer list-none items-center justify-center rounded-md p-2 transition-colors hover:bg-[var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
        aria-label={
          initialUnreadCount > 0 ? `Notifications, ${initialUnreadCount} unread` : "Notifications"
        }
      >
        <BellIcon className="h-5 w-5" />
        {initialUnreadCount > 0 && (
          // Deliberately NOT --danger: that token is calibrated as a text/
          // outline color (see button.tsx's own doc comment on why it must
          // never be a solid white-on-fill background) — this fixed,
          // always-legible red is the one intentional theme-invariant
          // exception in this batch, matching the conventional "count
          // badge is always red" pattern most apps use regardless of
          // theme. border-surface (not the old hardcoded border-white)
          // is the real fix here — it now matches whichever surface the
          // bell itself sits on (Header's own bg-surface) in both themes,
          // instead of a Light-only white notch that would look foreign
          // in Dark.
          <span
            aria-hidden="true"
            className="border-surface absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border bg-red-600 px-1 text-[10px] leading-none font-semibold text-white"
          >
            {badgeLabel}
          </span>
        )}
      </summary>
      <div className={`absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] py-1 shadow-lg sm:w-96 ${CARD_SURFACE_CLASSES}`}>
        <NotificationDropdown
          notifications={initialNotifications}
          hasUnread={initialUnreadCount > 0}
          onNavigate={close}
        />
      </div>
    </details>
  );
}
