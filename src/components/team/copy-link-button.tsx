"use client";

import { useState } from "react";
import { useToast } from "@/components/toast/toast-provider";

/**
 * Builds the invite URL from the browser's own origin at click time —
 * never hardcoded, so it's correct in local dev, Preview, and production
 * alike without any server-side host/header plumbing.
 */
export function CopyLinkButton({ token }: { token: string }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast("Invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Couldn't copy the link", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="border-border-strong text-text-secondary focus-visible:ring-focus-ring rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
