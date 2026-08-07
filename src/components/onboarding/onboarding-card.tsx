import { OnboardingProgressBar } from "./onboarding-progress-bar";
import { OnboardingStepRow } from "./onboarding-step-row";
import { DismissOnboardingButton } from "./dismiss-onboarding-button";
import { shouldRenderOnboardingCard } from "./should-render-card";
import type { OnboardingProgressSummary } from "@/lib/onboarding/progress";

/**
 * Stage 3 task §2/§3/§4/§11. An ordinary Dashboard card — never a wizard,
 * modal, full page, or blocking overlay (docs/onboarding-architecture.md
 * §11) — visually consistent with the bordered-card treatment every other
 * dashboard section already uses. Renders only on `/dashboard`
 * ((dashboard)/dashboard/page.tsx passes the progress summary in) —
 * absent everywhere else by construction, since nothing else imports it.
 *
 * Visibility (§4): completely absent, not collapsed/hidden-via-CSS, once
 * dismissed or complete.
 *
 * Mobile (§15): no separate mobile component — the same responsive
 * flex/stack rules in this file and OnboardingStepRow reflow the header,
 * progress bar, and each row at every breakpoint down to 320px, the same
 * "one component adapts its own layout" philosophy Sidebar/NotificationBell
 * already use, rather than introducing a second collapse/expand
 * interaction not covered by this stage's own action list (§9).
 */
export function OnboardingCard({ progress }: { progress: OnboardingProgressSummary }) {
  if (!shouldRenderOnboardingCard(progress)) {
    return null;
  }

  return (
    <section aria-labelledby="onboarding-heading" className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="onboarding-heading" className="text-lg font-semibold tracking-tight text-gray-900">
            Getting started
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Complete these steps to get the most out of your workspace.
          </p>
        </div>
        <DismissOnboardingButton />
      </div>

      {/* Live region: a step flipping to Done (e.g. a Client created in
          another tab) after a skip/dismiss revalidation is announced to
          screen readers the same way toast-provider.tsx's own region
          already announces toasts (docs/onboarding-architecture.md §12). */}
      <div className="mt-4" aria-live="polite">
        <OnboardingProgressBar
          completedCount={progress.completedCount}
          totalCount={progress.totalCount}
          percent={progress.percent}
        />
      </div>

      <ul className="mt-6 divide-y divide-gray-200">
        {progress.steps.map((step) => (
          <li key={step.key} className="py-4 first:pt-0 last:pb-0">
            <OnboardingStepRow step={step} />
          </li>
        ))}
      </ul>
    </section>
  );
}
