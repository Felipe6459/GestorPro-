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
 * Correctness note — `ThemeProvider`'s own `mode`/`resolvedTheme` come
 * from `useSyncExternalStore`, which (by design, see `theme-provider.tsx`'s
 * own doc comment) renders a fixed SSR-safe placeholder
 * (`getServerMode()` = `DEFAULT_THEME_MODE`, "system") on the client's
 * first (hydrating) pass, then corrects to the real client value
 * (`getClientMode()`, read from the actual cookie) on an immediate
 * follow-up render. This effect can therefore observe `currentMode`
 * still holding that transient placeholder on its very first firing —
 * checking equality against `mode` (the DB value) at that exact moment
 * would be comparing against a value that hasn't settled yet, not the
 * real client truth. Guarding against action ONLY inside the
 * `mode !== currentMode` branch (rather than unconditionally marking
 * `mode` as "handled" the instant this effect fires at all, regardless
 * of whether the placeholder briefly happened to match `mode`) is what
 * makes this converge correctly: a coincidental placeholder/DB match on
 * the first pass is a legitimate no-op FOR THAT RENDER, not a permanent
 * decision — the effect naturally re-evaluates once `currentMode`
 * settles to its real value on the very next render (`currentMode` is a
 * dependency), and only THEN does `reconciledFor` latch, exactly once,
 * preventing this component from later re-fighting a legitimate
 * subsequent mode change made through any other path (a future Settings
 * UI, System/Automatic's own live updates) — `mode` itself (the prop)
 * never changes for the lifetime of one server-rendered page, so once
 * reconciliation has genuinely happened for it, this must never act
 * again for that same value even if `currentMode` later diverges from it
 * for a legitimate reason.
 */
export function ThemePreferenceReconciler({ mode }: { mode: ThemeMode }) {
  const { mode: currentMode, setMode } = useTheme();
  const reconciledFor = useRef<ThemeMode | null>(null);

  useEffect(() => {
    if (mode === currentMode) return;
    if (reconciledFor.current === mode) return;
    reconciledFor.current = mode;
    setMode(mode);
  }, [mode, currentMode, setMode]);

  return null;
}
