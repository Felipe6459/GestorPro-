"use client";

import { useCallback, useMemo, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { useToast } from "@/components/toast/toast-provider";
import { CheckIcon } from "@/components/ui/icons";
import { createLatestModePersistenceCoordinator } from "@/lib/theme/persist-latest-mode-coordinator";
import { updateThemeModeAction } from "@/app/(dashboard)/theme-actions";
import type { ThemeMode } from "@/lib/theme/types";

const OPTIONS: readonly { mode: ThemeMode; title: string; description: string }[] = [
  { mode: "light", title: "Light", description: "Always use the light theme." },
  { mode: "dark", title: "Dark", description: "Always use the dark theme." },
  { mode: "system", title: "System", description: "Follow your device's appearance setting." },
  {
    mode: "automatic",
    title: "Automatic",
    description: "Uses Light from 07:00 to 19:00 and Dark outside those hours, based on your device's local time.",
  },
];

const PERSIST_FAILURE_MESSAGE = "Theme changed on this device, but we couldn't save it to your account.";

/**
 * Aqenra Phase D — the staff Appearance selector. The first real
 * authenticated caller of the Phase C2 persistence infrastructure: this
 * component owns identity-aware persistence entirely on its own —
 * `ThemeProvider`/`useTheme()` stay exactly as identity-agnostic as they
 * already are (no import of this component, `updateThemeModeAction`, or
 * the coordinator anywhere in theme-provider.tsx).
 *
 * `useTheme().mode` is the ONLY source of "current selection" — never a
 * second read of the cookie, never an independent System/Automatic
 * re-derivation. Whatever authenticated DB->runtime reconciliation
 * already did in the parent (dashboard) layout (see
 * ThemePreferenceReconciler) is simply reflected here as the initial
 * selected option; this component adds no second reconciliation pass
 * and makes no DB read of its own on mount.
 *
 * The persistence coordinator is created exactly once per mount (a lazy
 * `useState` initializer, never recreated on re-render) — this is the
 * "be careful about coordinator lifecycle across renders" requirement:
 * a coordinator recreated every render would lose its own in-flight/
 * queued state on every parent re-render (e.g. resolvedTheme changing
 * live under System/Automatic), silently breaking the latest-wins
 * guarantee.
 */
export function AppearanceSelector() {
  const { mode, resolvedTheme, setMode } = useTheme();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  const persist = useCallback(
    async (nextMode: ThemeMode) => {
      setPending(true);
      try {
        await updateThemeModeAction(nextMode);
      } catch {
        // C2's own documented trade-off: local appearance never rolls
        // back. One restrained, existing-pattern toast per failed
        // attempt — never a repeated toast for the SAME still-pending
        // failure (the coordinator only ever calls persist() again for
        // a genuinely new later selection, so this naturally can't spam
        // during a single rapid-switch sequence).
        showToast(PERSIST_FAILURE_MESSAGE, "error");
        throw new Error("theme-persist-failed");
      } finally {
        setPending(false);
      }
    },
    [showToast],
  );

  // Lazy-initialized once; `persist` itself is stable across renders
  // (useCallback with a stable `showToast`), so recreating the
  // coordinator here would only ever happen on the initial render.
  const [coordinator] = useState(() => createLatestModePersistenceCoordinator<ThemeMode>(persist));

  const handleSelect = useCallback(
    (nextMode: ThemeMode) => {
      // 1. Instant local effect — DOM attribute, aqenra_theme cookie,
      // and ThemeProvider's own state — via the exact same setMode()
      // path a click on the Phase B/TEST_MODE harness already used.
      setMode(nextMode);
      // 2. Serialized, latest-wins authenticated persistence — never a
      // second, page-local race-handling implementation.
      coordinator.request(nextMode);
    },
    [setMode, coordinator],
  );

  const resolvedHint = useMemo(() => {
    if (mode !== "system" && mode !== "automatic") return null;
    return resolvedTheme === "dark" ? "Currently using Dark" : "Currently using Light";
  }, [mode, resolvedTheme]);

  return (
    <fieldset>
      <legend className="sr-only">Appearance</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = mode === option.mode;
          const titleId = `appearance-${option.mode}-title`;
          const descId = `appearance-${option.mode}-description`;
          return (
            <label
              key={option.mode}
              className="has-[:checked]:border-accent has-[:checked]:bg-accent-subtle has-[:focus-visible]:ring-focus-ring border-border-default bg-surface relative flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors hover:bg-[var(--hover)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2"
            >
              <input
                type="radio"
                name="aqenra-theme-mode"
                value={option.mode}
                checked={selected}
                onChange={() => handleSelect(option.mode)}
                // Explicit aria-labelledby/aria-describedby, rather than
                // relying on the wrapping <label>'s full text content:
                // without this, the label's DESCRIPTION text would also
                // become part of the radio's ACCESSIBLE NAME (screen
                // readers would announce title+description run together
                // as one name, with aria-describedby then redundantly
                // repeating the description) — this keeps "name" (the
                // mode) and "description" (what it does) properly
                // separate, exactly what aria-describedby is for.
                aria-labelledby={titleId}
                aria-describedby={descId}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2">
                <span id={titleId} className="text-text-primary text-sm font-medium">
                  {option.title}
                </span>
                <CheckIcon className={`text-accent h-4 w-4 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`} />
              </span>
              <span id={descId} className="text-text-secondary text-xs">
                {option.description}
              </span>
              {selected && resolvedHint && <span className="text-text-muted text-xs">{resolvedHint}</span>}
            </label>
          );
        })}
      </div>
      <p className="text-text-muted mt-3 text-xs" role="status" aria-live="polite">
        {pending ? "Saving…" : " "}
      </p>
    </fieldset>
  );
}
