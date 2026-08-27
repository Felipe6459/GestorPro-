import { describe, expect, it } from "vitest";
import { toOnboardingProgressView } from "@/lib/platform-admin/onboarding-progress-view";
import type { OnboardingProgressSummary, OnboardingStepResult } from "@/lib/onboarding/progress";

/**
 * Platform Admin Onboarding (Organization Detail, read-only). Proves
 * toOnboardingProgressView() genuinely narrows the full, tenant-facing
 * OnboardingProgressSummary down to exactly the operator-safe fields —
 * using exact-key assertions (Object.keys, not a handful of spot
 * checks) so a field like `targetHref`/`blockedReason`/`completionSource`/
 * `skippable` can never silently leak through a future edit to either
 * this mapper or its upstream source type.
 */

function makeStep(overrides: Partial<OnboardingStepResult> & Pick<OnboardingStepResult, "key">): OnboardingStepResult {
  return {
    label: `Label for ${overrides.key}`,
    status: "NOT_STARTED",
    required: false,
    skippable: true,
    actionable: true,
    blockedReason: null,
    targetHref: "/settings/company",
    completionSource: "none",
    ...overrides,
  };
}

function makeSummary(overrides: Partial<OnboardingProgressSummary> = {}): OnboardingProgressSummary {
  return {
    steps: [makeStep({ key: "COMPANY_PROFILE", status: "COMPLETE", required: true, completionSource: "computed" })],
    completedCount: 1,
    totalCount: 5,
    requiredCompleted: 1,
    requiredTotal: 2,
    percent: 20,
    isComplete: false,
    isDismissed: false,
    ...overrides,
  };
}

describe("toOnboardingProgressView", () => {
  it("the top-level view contains exactly the approved summary fields — no more, no fewer", () => {
    const view = toOnboardingProgressView(makeSummary());
    expect(Object.keys(view).sort()).toEqual(
      ["steps", "requiredCompleted", "requiredTotal", "completedCount", "totalCount", "percent", "isComplete", "isDismissed"].sort(),
    );
  });

  it("each step view contains exactly {key, label, status, required} — no more, no fewer", () => {
    const view = toOnboardingProgressView(makeSummary());
    expect(Object.keys(view.steps[0]).sort()).toEqual(["key", "label", "status", "required"].sort());
  });

  it("never carries targetHref, actionable, blockedReason, skippable, or completionSource on any step, even when the source step has all of them set to truthy/non-null values", () => {
    const summary = makeSummary({
      steps: [
        makeStep({
          key: "PAYMENT_DETAILS",
          targetHref: "/settings/payment",
          actionable: true,
          blockedReason: "Some blocked reason",
          skippable: true,
          completionSource: "skipped",
        }),
      ],
    });
    const view = toOnboardingProgressView(summary);
    const stepView = view.steps[0] as unknown as Record<string, unknown>;
    expect(stepView.targetHref).toBeUndefined();
    expect(stepView.actionable).toBeUndefined();
    expect(stepView.blockedReason).toBeUndefined();
    expect(stepView.skippable).toBeUndefined();
    expect(stepView.completionSource).toBeUndefined();
  });

  it("preserves key/label/status/required values exactly", () => {
    const summary = makeSummary({
      steps: [makeStep({ key: "INVITE_TEAMMATE", label: "Invite a teammate", status: "SKIPPED", required: false })],
    });
    const view = toOnboardingProgressView(summary);
    expect(view.steps[0]).toEqual({ key: "INVITE_TEAMMATE", label: "Invite a teammate", status: "SKIPPED", required: false });
  });

  it("preserves every summary-level count/flag exactly", () => {
    const summary = makeSummary({
      requiredCompleted: 2,
      requiredTotal: 3,
      completedCount: 4,
      totalCount: 9,
      percent: 44,
      isComplete: true,
      isDismissed: true,
    });
    const view = toOnboardingProgressView(summary);
    expect(view.requiredCompleted).toBe(2);
    expect(view.requiredTotal).toBe(3);
    expect(view.completedCount).toBe(4);
    expect(view.totalCount).toBe(9);
    expect(view.percent).toBe(44);
    expect(view.isComplete).toBe(true);
    expect(view.isDismissed).toBe(true);
  });

  it("maps every step in the summary, preserving order, for a multi-step summary", () => {
    const summary = makeSummary({
      steps: [
        makeStep({ key: "WELCOME", status: "COMPLETE", required: false }),
        makeStep({ key: "COMPANY_PROFILE", status: "COMPLETE", required: true }),
        makeStep({ key: "CREATE_CLIENT", status: "NOT_STARTED", required: true }),
      ],
    });
    const view = toOnboardingProgressView(summary);
    expect(view.steps.map((s) => s.key)).toEqual(["WELCOME", "COMPANY_PROFILE", "CREATE_CLIENT"]);
  });

  it("handles a fresh organization's summary (all steps NOT_STARTED, zero completed) without throwing", () => {
    const summary = makeSummary({
      steps: [
        makeStep({ key: "COMPANY_PROFILE", status: "NOT_STARTED", required: true }),
        makeStep({ key: "CREATE_CLIENT", status: "NOT_STARTED", required: true }),
      ],
      completedCount: 0,
      totalCount: 2,
      requiredCompleted: 0,
      requiredTotal: 2,
      percent: 0,
      isComplete: false,
      isDismissed: false,
    });
    expect(() => toOnboardingProgressView(summary)).not.toThrow();
    const view = toOnboardingProgressView(summary);
    expect(view.percent).toBe(0);
    expect(view.steps.every((s) => s.status === "NOT_STARTED")).toBe(true);
  });
});
