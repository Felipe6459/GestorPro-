import type { ReactNode } from "react";
import type { OnboardingStepStatus } from "@/lib/onboarding/progress";

/**
 * Purely decorative per-status glyph (`aria-hidden`) — the adjacent
 * `StatusBadge` text label is the actual accessible status conveyance
 * (Stage 3 task §14, docs/onboarding-architecture.md §12's "never
 * color-only" rule: text + icon + tone together, never color alone).
 */
/**
 * Per-status ring color and inner glyph (Stage 5: deduplicated from four
 * near-identical `<svg>` blocks into one shell — same visual output).
 * `null` inner content means a plain ring, no glyph (NOT_STARTED, and the
 * default fallback).
 *
 * Design System Batch 5 — colorClass mapped to the same semantic tones
 * StatusBadge's own STATUS_TONES already assigns these exact statuses
 * (COMPLETE -> success, SKIPPED/NOT_APPLICABLE/NOT_STARTED -> muted/
 * neutral) — no new meaning invented. SKIPPED/NOT_APPLICABLE/NOT_STARTED
 * all collapse to the one --text-muted tone (gray-400 vs. gray-300 was a
 * one-shade difference imperceptible next to the adjacent StatusBadge
 * pill, which already carries the real distinction) rather than reaching
 * for an alpha-based border token as a foreground `currentColor` — those
 * are designed as backgrounds over an opaque ancestor, not as text/stroke
 * colors (see button.tsx's own doc comment on this exact class of bug).
 */
const STATUS_ICON: Record<OnboardingStepStatus, { colorClass: string; dashed?: boolean; inner: ReactNode }> = {
  COMPLETE: {
    colorClass: "text-success",
    inner: (
      <path
        d="m8.25 12.5 2.5 2.5 5-5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  SKIPPED: {
    colorClass: "text-text-muted",
    inner: <path d="M9.5 9.5h5M14.5 9.5 9.5 14.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />,
  },
  NOT_APPLICABLE: { colorClass: "text-text-muted", dashed: true, inner: null },
  NOT_STARTED: { colorClass: "text-text-muted", inner: null },
};

export function OnboardingStepIcon({ status }: { status: OnboardingStepStatus }) {
  const { colorClass, dashed, inner } = STATUS_ICON[status] ?? STATUS_ICON.NOT_STARTED;

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`mt-0.5 h-5 w-5 shrink-0 ${colorClass}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" strokeDasharray={dashed ? "2.5 2.5" : undefined} />
      {inner}
    </svg>
  );
}
