"use client";

import { useTransition } from "react";
import { useToast } from "@/components/toast/toast-provider";
import { skipOnboardingStepAction } from "@/lib/onboarding/actions";
import type { OnboardingStepKey } from "@/generated/prisma/enums";

// Matches Button's own secondary variant tokens exactly (same constant
// onboarding-step-row.tsx's own "Go to" link uses), but stays a plain
// <button> here rather than the shared <Button> component — this and the
// adjacent "Go to" link can render side by side in the same row (both
// independently controlled — see this file's own doc comment) and must
// stay the same compact px-3 py-1.5 size; Button's own base classes
// already hardcode px-4 py-2, and appending a conflicting padding utility
// on top is the exact "two same-specificity Tailwind utilities, order
// doesn't decide the winner" bug button.tsx's own doc comment warns
// against — safer to match the sibling link's own literal size directly.
const SKIP_BUTTON_CLASSES =
  "border-border-strong bg-surface text-text-primary focus-visible:ring-focus-ring rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Same "use client" + useTransition + direct-Server-Action-call pattern as
 * ResetPreferencesButton/NotificationDropdown — the action's own
 * `revalidatePath("/dashboard")` (src/lib/onboarding/actions.ts) refreshes
 * this row's status without a manual reload or router.refresh() call.
 *
 * Stage 5 polish: on success this button itself unmounts (the row's own
 * `showSkip` flips false once its status is SKIPPED) — `returnFocusId`
 * moves focus to the row's own label so it isn't silently dropped to
 * <body>, the same pattern DismissOnboardingButton now uses for the whole
 * card.
 */
export function SkipStepButton({
  stepKey,
  label,
  returnFocusId,
}: {
  stepKey: OnboardingStepKey;
  label: string;
  returnFocusId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleClick() {
    startTransition(async () => {
      const result = await skipOnboardingStepAction(stepKey);
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      document.getElementById(returnFocusId)?.focus();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      aria-label={`Skip: ${label}`}
      className={SKIP_BUTTON_CLASSES}
    >
      {isPending ? "Skipping…" : "Skip"}
    </button>
  );
}
