import type { OnboardingStepResult } from "@/lib/onboarding/progress";
import { ONBOARDING_STEP_DESCRIPTIONS } from "./step-copy";

export type OnboardingStepRowActions = {
  isBlocked: boolean;
  showGoTo: boolean;
  showSkip: boolean;
  description: string;
};

/**
 * Pure action-visibility rules for one step row (Stage 3 task §6/§9),
 * extracted out of OnboardingStepRow so this decision logic is unit-testable
 * without rendering React — mirrors how buildOnboardingProgress
 * (src/lib/onboarding/progress.ts) is kept pure and separate from its own
 * DB-backed caller. See OnboardingStepRow's own comment for the full
 * reasoning behind each rule, including why WELCOME/FINISH need no
 * special-casing here.
 */
export function getOnboardingStepRowActions(step: OnboardingStepResult): OnboardingStepRowActions {
  const isBlocked = step.status === "NOT_STARTED" && !step.actionable;
  const showGoTo = step.status === "NOT_STARTED" && step.actionable && step.targetHref !== null;
  const showSkip = step.status === "NOT_STARTED" && step.skippable;
  const description = isBlocked && step.blockedReason ? step.blockedReason : ONBOARDING_STEP_DESCRIPTIONS[step.key];

  return { isBlocked, showGoTo, showSkip, description };
}
