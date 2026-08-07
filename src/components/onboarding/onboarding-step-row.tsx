import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { OnboardingStepIcon } from "./onboarding-step-icon";
import { SkipStepButton } from "./skip-step-button";
import { getOnboardingStepRowActions } from "./step-row-actions";
import type { OnboardingStepResult } from "@/lib/onboarding/progress";

/**
 * Stage 3 task §6/§9. Action rules, derived directly from the Stage 2
 * contract (src/lib/onboarding/progress.ts), never invented separately:
 * - COMPLETE / NOT_APPLICABLE: no button (§9).
 * - NOT_STARTED, blocked (`actionable: false`): show `blockedReason`
 *   instead of the normal description; no buttons — skip is still offered
 *   if `skippable`, matching the Stage 2 skip action's own contract (it has
 *   no dependency check).
 * - NOT_STARTED, actionable: a "Go to" link when `targetHref` exists, and a
 *   "Skip" button when `skippable` — independent, both can show together.
 * - SKIPPED: no button. Un-skipping only ever happens by doing the real
 *   thing elsewhere in the app (§9's "stale row is harmless dead data"
 *   stance) — this card has nothing to un-skip it with directly.
 * WELCOME/FINISH naturally get no action button: both have `targetHref:
 * null` and `skippable: false`, so the two conditions above simply never
 * trigger for them — no special-casing needed.
 */
export function OnboardingStepRow({ step }: { step: OnboardingStepResult }) {
  const { showGoTo, showSkip, description } = getOnboardingStepRowActions(step);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <OnboardingStepIcon status={step.status} />
        <div>
          <p className="text-sm font-medium text-gray-900">{step.label}</p>
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pl-3">
        <StatusBadge status={step.status} />
        {showGoTo && step.targetHref && (
          <Link
            href={step.targetHref}
            aria-label={`Go to: ${step.label}`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
          >
            Go to
          </Link>
        )}
        {showSkip && <SkipStepButton stepKey={step.key} label={step.label} />}
      </div>
    </div>
  );
}
