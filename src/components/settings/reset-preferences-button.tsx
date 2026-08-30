"use client";

import { useTransition } from "react";
import { useToast } from "@/components/toast/toast-provider";
import { resetNotificationPreferencesAction } from "@/app/(dashboard)/settings/actions";

export function ResetPreferencesButton() {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleClick() {
    startTransition(async () => {
      try {
        await resetNotificationPreferencesAction();
        showToast("Notification preferences reset to defaults.");
      } catch {
        showToast("Failed to reset preferences.", "error");
      }
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className="border-border-strong text-text-secondary focus-visible:ring-focus-ring rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Reset to defaults
    </button>
  );
}
