import type { OnboardingStepStatus } from "@/lib/onboarding/progress";

/**
 * Purely decorative per-status glyph (`aria-hidden`) — the adjacent
 * `StatusBadge` text label is the actual accessible status conveyance
 * (Stage 3 task §14, docs/onboarding-architecture.md §12's "never
 * color-only" rule: text + icon + tone together, never color alone).
 */
export function OnboardingStepIcon({ status }: { status: OnboardingStepStatus }) {
  const className = "mt-0.5 h-5 w-5 shrink-0";

  switch (status) {
    case "COMPLETE":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`${className} text-green-600`}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="m8.25 12.5 2.5 2.5 5-5.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "SKIPPED":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`${className} text-gray-400`}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path d="M9.5 9.5h5M14.5 9.5 9.5 14.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "NOT_APPLICABLE":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`${className} text-gray-300`}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" strokeDasharray="2.5 2.5" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`${className} text-gray-300`}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
  }
}
