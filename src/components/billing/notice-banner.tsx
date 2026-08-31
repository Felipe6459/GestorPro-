import type { BillingNotice } from "@/lib/billing/view-model";

// Design System Batch 8 — matches the border-{tone} + bg-{tone}-subtle +
// text-{tone} pattern already established in invite-form.tsx's own
// warning/success notice; neutral has no dedicated brand-color pair (same
// reasoning as StatusBadge's own "neutral"), so it uses the existing
// surface/text scale instead.
const TONE_STYLES: Record<BillingNotice["tone"], string> = {
  neutral: "border-border-default bg-surface-muted text-text-secondary",
  info: "border-info bg-info-subtle text-info",
  success: "border-success bg-success-subtle text-success",
  warning: "border-warning bg-warning-subtle text-warning",
  danger: "border-danger bg-danger-subtle text-danger",
};

/**
 * Billing & Subscriptions Stage 3. Shared renderer for both the Current
 * Plan section's status notice and the page-level access-mode banner — one
 * tone->style map so "danger" always looks the same regardless of which
 * section produced it. Never color-only: warning/danger notices also get
 * role="alert"/aria-live="assertive" so a screen reader announces them
 * without the user needing to perceive color.
 */
export function NoticeBanner({ notice }: { notice: BillingNotice }) {
  const isUrgent = notice.tone === "danger" || notice.tone === "warning";

  return (
    <div
      role={isUrgent ? "alert" : "status"}
      aria-live={isUrgent ? "assertive" : "polite"}
      className={`rounded-md border px-4 py-3 text-sm ${TONE_STYLES[notice.tone]}`}
    >
      {notice.message}
    </div>
  );
}
