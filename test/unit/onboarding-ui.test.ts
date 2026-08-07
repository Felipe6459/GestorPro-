import { describe, expect, it } from "vitest";
import { buildOnboardingProgress, type OnboardingRawSignals, type OnboardingStepResult } from "@/lib/onboarding/progress";
import { getOnboardingStepRowActions } from "@/components/onboarding/step-row-actions";
import { shouldRenderOnboardingCard } from "@/components/onboarding/should-render-card";
import type { OnboardingStepKey } from "@/generated/prisma/enums";

/**
 * Onboarding Stage 3 (Stage 3 task §19). Unit-tests the pure UI decision
 * logic extracted out of the components themselves
 * (step-row-actions.ts/should-render-card.ts) — real step results come from
 * the already-tested buildOnboardingProgress (test/unit/onboarding-
 * progress.test.ts) rather than hand-built fixtures, so these tests exercise
 * the real Stage 2 contract shape, not an invented one.
 */

function signals(overrides: Partial<OnboardingRawSignals> = {}): OnboardingRawSignals {
  return {
    hasClient: false,
    hasProject: false,
    hasTask: false,
    hasSecondMember: false,
    hasPortalUser: false,
    actedStepKeys: new Set<OnboardingStepKey>(),
    ...overrides,
  };
}

function stepOf(progress: ReturnType<typeof buildOnboardingProgress>, key: OnboardingStepKey): OnboardingStepResult {
  return progress.steps.find((s) => s.key === key)!;
}

describe("getOnboardingStepRowActions", () => {
  it("a fresh org: CREATE_CLIENT (NOT_STARTED, no dependency) is actionable with a Go-to link, not skippable", () => {
    const progress = buildOnboardingProgress(signals());
    const actions = getOnboardingStepRowActions(stepOf(progress, "CREATE_CLIENT"));
    expect(actions.isBlocked).toBe(false);
    expect(actions.showGoTo).toBe(true);
    expect(actions.showSkip).toBe(false);
  });

  it("a fresh org: CREATE_PROJECT is blocked behind CREATE_CLIENT — no Go-to, no Skip, description is the exact empty-state copy", () => {
    const progress = buildOnboardingProgress(signals());
    const actions = getOnboardingStepRowActions(stepOf(progress, "CREATE_PROJECT"));
    expect(actions.isBlocked).toBe(true);
    expect(actions.showGoTo).toBe(false);
    expect(actions.showSkip).toBe(false);
    expect(actions.description).toBe("Projects must belong to a client. Add one before creating a project.");
  });

  it("a fresh org: CREATE_TASK is blocked behind CREATE_PROJECT, but skip is still offered (skip has no dependency check)", () => {
    const progress = buildOnboardingProgress(signals());
    const actions = getOnboardingStepRowActions(stepOf(progress, "CREATE_TASK"));
    expect(actions.isBlocked).toBe(true);
    expect(actions.showGoTo).toBe(false);
    expect(actions.showSkip).toBe(true);
    expect(actions.description).toBe("Tasks must belong to a project. Add one before creating a task.");
  });

  it("an unblocked, skippable step (INVITE_TEAMMATE) shows both Go-to and Skip", () => {
    const progress = buildOnboardingProgress(signals());
    const actions = getOnboardingStepRowActions(stepOf(progress, "INVITE_TEAMMATE"));
    expect(actions.isBlocked).toBe(false);
    expect(actions.showGoTo).toBe(true);
    expect(actions.showSkip).toBe(true);
  });

  it("a COMPLETE step (real data) shows no action at all", () => {
    const progress = buildOnboardingProgress(signals({ hasClient: true }));
    const actions = getOnboardingStepRowActions(stepOf(progress, "CREATE_CLIENT"));
    expect(actions.showGoTo).toBe(false);
    expect(actions.showSkip).toBe(false);
  });

  it("a SKIPPED step shows no action at all — un-skip only ever happens by doing the real thing", () => {
    const progress = buildOnboardingProgress(
      signals({ actedStepKeys: new Set<OnboardingStepKey>(["INVITE_TEAMMATE"]) }),
    );
    const step = stepOf(progress, "INVITE_TEAMMATE");
    expect(step.status).toBe("SKIPPED");
    const actions = getOnboardingStepRowActions(step);
    expect(actions.showGoTo).toBe(false);
    expect(actions.showSkip).toBe(false);
  });

  it("the billing placeholder (NOT_APPLICABLE) shows no action at all", () => {
    const progress = buildOnboardingProgress(signals());
    const step = stepOf(progress, "REVIEW_BILLING");
    expect(step.status).toBe("NOT_APPLICABLE");
    const actions = getOnboardingStepRowActions(step);
    expect(actions.showGoTo).toBe(false);
    expect(actions.showSkip).toBe(false);
  });

  it("WELCOME and FINISH naturally get no action button (null targetHref, not skippable) with no special-casing", () => {
    const progress = buildOnboardingProgress(signals());
    for (const key of ["WELCOME", "FINISH"] as const) {
      const actions = getOnboardingStepRowActions(stepOf(progress, key));
      expect(actions.showGoTo).toBe(false);
      expect(actions.showSkip).toBe(false);
    }
  });
});

describe("shouldRenderOnboardingCard", () => {
  it("a fresh, empty organization renders the card", () => {
    const progress = buildOnboardingProgress(signals());
    expect(shouldRenderOnboardingCard(progress)).toBe(true);
  });

  it("a partially-progressed organization still renders the card", () => {
    const progress = buildOnboardingProgress(signals({ hasClient: true, hasProject: true }));
    expect(progress.isComplete).toBe(false);
    expect(shouldRenderOnboardingCard(progress)).toBe(true);
  });

  it("a fully complete organization (every substantive step done) hides the card", () => {
    const progress = buildOnboardingProgress(
      signals({ hasClient: true, hasProject: true, hasTask: true, hasSecondMember: true, hasPortalUser: true }),
    );
    expect(progress.isComplete).toBe(true);
    expect(shouldRenderOnboardingCard(progress)).toBe(false);
  });

  it("a dismissed organization (FINISH acknowledged) hides the card even with nothing else done", () => {
    const progress = buildOnboardingProgress(signals({ actedStepKeys: new Set<OnboardingStepKey>(["FINISH"]) }));
    expect(progress.isDismissed).toBe(true);
    expect(progress.isComplete).toBe(false);
    expect(shouldRenderOnboardingCard(progress)).toBe(false);
  });
});
