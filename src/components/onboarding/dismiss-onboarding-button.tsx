"use client";

import { useTransition } from "react";
import { useToast } from "@/components/toast/toast-provider";
import { finishOnboardingAction } from "@/lib/onboarding/actions";

/**
 * Stage 3 task §11 — top-right "Dismiss onboarding" control. Calls the
 * Stage 2 `finishOnboardingAction` (a FINISH row, docs/onboarding-
 * architecture.md §9's row-existence model) — `revalidatePath("/dashboard")`
 * inside that action makes the whole card disappear on the next render,
 * no manual reload.
 */
export function DismissOnboardingButton() {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleClick() {
    startTransition(async () => {
      const result = await finishOnboardingAction();
      if (!result.ok) {
        showToast(result.message, "error");
      }
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className="shrink-0 rounded text-sm font-medium text-gray-500 transition-colors hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Hiding…" : "Dismiss onboarding"}
    </button>
  );
}
