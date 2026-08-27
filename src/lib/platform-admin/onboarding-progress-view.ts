import type { OnboardingStepKey } from "@/generated/prisma/enums";
import type { OnboardingProgressSummary, OnboardingStepStatus } from "@/lib/onboarding/progress";

/**
 * Platform Admin Onboarding (Organization Detail, read-only). Reuses the
 * exact same authoritative engine the tenant Dashboard already uses
 * (getOrganizationOnboardingProgress() — src/lib/onboarding/progress.ts)
 * — no new readiness model, no reinterpreted step rules. This module's
 * only job is to narrow that already-computed summary down to the
 * fields an operator-facing, non-interactive view is allowed to see,
 * before it ever reaches organization-detail.ts's own return shape.
 *
 * Deliberately built via a fresh object literal per field, never a
 * spread or a destructuring-omit — the safest way to guarantee that a
 * future field added to OnboardingProgressSummary/OnboardingStepResult
 * (e.g. a new `targetHref`-shaped addition) cannot silently start
 * flowing through here unnoticed. Explicitly excluded, and must stay
 * excluded: `targetHref` (tenant-relative routes — meaningless and
 * potentially misleading with no active-organization session in
 * Platform Admin), `actionable`, `blockedReason`, `skippable`,
 * `completionSource`, and any row-level id (OnboardingStepResult itself
 * never carries one, but this mapper's own shape is the enforcement
 * point regardless of what the source type does or doesn't add later).
 */

export type OnboardingStepView = {
  key: OnboardingStepKey;
  label: string;
  status: OnboardingStepStatus;
  required: boolean;
};

export type OnboardingProgressView = {
  steps: OnboardingStepView[];
  requiredCompleted: number;
  requiredTotal: number;
  completedCount: number;
  totalCount: number;
  percent: number;
  isComplete: boolean;
  isDismissed: boolean;
};

export function toOnboardingProgressView(summary: OnboardingProgressSummary): OnboardingProgressView {
  return {
    steps: summary.steps.map((step) => ({
      key: step.key,
      label: step.label,
      status: step.status,
      required: step.required,
    })),
    requiredCompleted: summary.requiredCompleted,
    requiredTotal: summary.requiredTotal,
    completedCount: summary.completedCount,
    totalCount: summary.totalCount,
    percent: summary.percent,
    isComplete: summary.isComplete,
    isDismissed: summary.isDismissed,
  };
}
