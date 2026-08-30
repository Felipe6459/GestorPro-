"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./theme-provider";
import type { ThemeMode } from "@/lib/theme/types";

/**
 * Aqenra Theme Persistence Phase C2 — authenticated DB → cookie/runtime
 * reconciliation. Rendered as a plain (invisible) child anywhere inside
 * an already-authenticated tree that has resolved a durable `themeMode`
 * for the current identity (see `(dashboard)/layout.tsx` and
 * `portal/(app)/layout.tsx`, its only two call sites) — never inside the
 * public root layout, which never resolves any identity for theme
 * purposes at all (see `layout.tsx`'s own doc comment).
 *
 * Deliberately identity-agnostic: it receives an already-resolved runtime
 * `mode` as a plain prop and knows nothing about `User`/`PortalUser`,
 * Prisma, Server Actions, or which identity type supplied it — the same
 * "ThemeProvider must remain reusable by public/Portal/staff alike"
 * discipline the provider itself already follows (see
 * `theme-provider.tsx`'s own doc comment). All DB/schema knowledge stays
 * in the caller (the two layouts) and in `@/lib/theme/db-mode`'s pure
 * mapping — never here.
 *
 * Authority model (Phase C architecture review §6/§7): the device cookie
 * is authoritative for FIRST PAINT, because only browser/device state is
 * available before any authenticated data has loaded — this component
 * never runs before hydration and never touches the pre-paint script.
 * Once authenticated data IS available, the durable DB preference wins:
 * if it differs from the live client mode, this calls `setMode(mode)`
 * exactly once for the supplied value, which updates the DOM attribute,
 * the `aqenra_theme` cookie, and `ThemeProvider`'s own state — the same
 * single write path a real user's own click already uses. This can
 * therefore be a visible, one-time post-hydration transition when the
 * two disagree (e.g. a different device's stale cookie, or a shared
 * device) — never claimed as a no-flash guarantee, unlike the pre-paint
 * script's own first-paint job.
 *
 * CRITICAL correctness note — a real, reproduced bug this design fixes.
 * An earlier version compared `mode` (this prop, fixed for the whole
 * page's lifetime) against the LIVE `currentMode` from `useTheme()` on
 * every render, latching its "already handled" guard only once an actual
 * mismatch was found. That is unsafe: `currentMode` changes for TWO
 * indistinguishable reasons — (a) `ThemeProvider`'s own
 * `useSyncExternalStore` settling from its fixed SSR-safe placeholder
 * ("system") to the real client value on an immediate follow-up render
 * (a genuine "the truth just became known" event this component SHOULD
 * react to), and (b) a real, later, deliberate `setMode()` call from
 * anywhere else — a user's own click (e.g. `AppearanceSelector`), or
 * System/Automatic's own live re-resolution (a real Playwright E2E
 * reproduction: choosing an explicit mode on `/settings/appearance`
 * immediately after load was silently overwritten back to the stale DB
 * value, because the guard had never latched during the harmless
 * placeholder-coincidence render and was still "armed" the moment the
 * user's own click changed `currentMode`). Comparing against the live,
 * ever-changing `currentMode` cannot distinguish these two cases from
 * the outside.
 *
 * The fix: bind the comparison to a value read via `requestAnimationFrame`
 * on mount instead of reacting to every `currentMode` change. React
 * flushes `useSyncExternalStore`'s own settling render (if one is
 * needed) as an ordinary, higher-priority update that completes and
 * paints before the browser's NEXT animation frame — so by the time this
 * one-shot `requestAnimationFrame` callback runs, `currentModeRef`
 * (kept in sync on every render, a plain assignment during render — not
 * inside an effect or event handler) already reflects the fully-settled
 * client value, exactly once. This check runs exactly once per mount
 * (the effect's dependency array excludes `currentMode` on purpose) and
 * never again — so a later, real `setMode()` call from anywhere else
 * can never be "corrected" back to the DB value: by the time it happens,
 * this component isn't looking anymore.
 */
export function ThemePreferenceReconciler({ mode }: { mode: ThemeMode }) {
  const { mode: currentMode, setMode } = useTheme();
  const currentModeRef = useRef(currentMode);

  // Keeps the ref in sync outside of render (mutating a ref during render
  // itself is disallowed — react-hooks/refs). Runs after every render,
  // including the settling render `useSyncExternalStore` triggers, so by
  // the time the mount-only effect below's requestAnimationFrame callback
  // fires, this has already been updated to the latest value.
  useEffect(() => {
    currentModeRef.current = currentMode;
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (mode !== currentModeRef.current) {
        setMode(mode);
      }
    });
    return () => cancelAnimationFrame(frame);
    // `currentModeRef` is a ref, not a reactive value, so it's correctly
    // excluded from this dependency array — this effect must evaluate
    // exactly once per mount/mode value, never re-triggered by a later
    // legitimate `currentMode` change (see the doc comment above).
  }, [mode, setMode]);

  return null;
}
