"use client";

import Link from "next/link";
import { useState } from "react";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

const HEADING_ID = "portal-welcome-heading";

const PRIMARY_LINK_CLASSES =
  "focus-visible:ring-focus-ring rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const SECONDARY_LINK_CLASSES =
  "border-border-strong text-text-secondary focus-visible:ring-focus-ring rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

/**
 * Client Portal welcome banner — Stage 4 (docs/onboarding-architecture.md
 * §17). An ordinary part of the /portal page, never a modal — the same
 * "inline, dismissible" stance the staff Dashboard onboarding card already
 * uses (src/components/onboarding/onboarding-card.tsx), but a genuinely
 * separate, thinner component: no staff onboarding table, no steps, no
 * progress, no Server Action at all. `eligible` is computed server-side by
 * the caller (portal-welcome-eligibility.ts, from the current PortalUser's
 * own `createdAt`) — this component only ever renders or doesn't, it never
 * resolves identity itself.
 *
 * Dismiss is deliberately NOT persisted (docs/onboarding-architecture.md
 * §17 left the choice between a persisted flag and a computed signal open;
 * this stage's own instructions default to zero-migration and explicitly
 * allow a non-persistent dismiss) — clicking "Got it" hides the banner for
 * the rest of this page instance only, via plain component state. No
 * network call, no cookie, no write of any kind. Returning to /portal
 * later (a reload, a new tab, a new day) shows it again as long as
 * `eligible` is still true — an accepted tradeoff of not adding a column
 * for this, not an oversight.
 */
export function PortalWelcomeBanner({
  eligible,
  returnFocusId,
}: {
  eligible: boolean;
  returnFocusId: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (!eligible || dismissed) {
    return null;
  }

  function handleDismiss() {
    setDismissed(true);
    // The nearest meaningful landing point once this region is gone —
    // never left to fall back to <body>, the same "focus goes somewhere
    // deliberate" discipline NotificationBell's own close() already
    // follows for its popover.
    document.getElementById(returnFocusId)?.focus();
  }

  return (
    <section aria-labelledby={HEADING_ID} className={`p-6 ${CARD_SURFACE_CLASSES}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id={HEADING_ID} className="text-text-primary text-lg font-semibold tracking-tight">
            Welcome to your client portal
          </h2>
          <p className="text-text-muted mt-1 text-sm">Here you can:</p>
          <ul className="text-text-muted mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>View shared projects</li>
            <li>Review invoices</li>
            <li>Download files</li>
            <li>Manage your portal profile</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss welcome message"
          className="text-text-muted focus-visible:ring-focus-ring shrink-0 rounded text-sm font-medium transition-colors hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Got it
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/portal/projects" className={PRIMARY_LINK_CLASSES}>
          View projects
        </Link>
        <Link href="/portal/invoices" className={SECONDARY_LINK_CLASSES}>
          View invoices
        </Link>
      </div>
    </section>
  );
}
