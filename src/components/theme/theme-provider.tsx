"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  computeNextAutomaticTransitionMs,
  extractCookieValue,
  parseThemeCookie,
  resolveTheme,
  serializeThemeCookie,
} from "@/lib/theme/resolve";
import { DEFAULT_THEME_MODE, THEME_COOKIE_NAME, type ResolvedTheme, type ThemeMode } from "@/lib/theme/types";

const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // ~1 year, matches every other long-lived cookie in this app

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Throws outside a <ThemeProvider> rather than silently defaulting — a missing provider is a real bug, not a themeable "no preference" state. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme() must be used within <ThemeProvider>");
  }
  return ctx;
}

function getPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(PREFERS_DARK_QUERY).matches
    : false;
}

/**
 * Writes the non-sensitive `aqenra_theme` cookie directly via
 * `document.cookie` — this is the ONE deliberate httpOnly:false cookie
 * in this codebase (see resolve.ts's top-of-file comment for the full
 * contract/justification); nothing here ever writes anything but a
 * ThemeMode/ResolvedTheme pair.
 */
function writeThemeCookie(mode: ThemeMode, resolved: ResolvedTheme): void {
  const value = serializeThemeCookie(mode, resolved);
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_COOKIE_NAME}=${value}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

// useSyncExternalStore plumbing for the initial mode/resolvedTheme read
// only (see the long comment on ThemeProvider below for why this exists
// at all instead of a lazy useState initializer or a mount effect). No
// real subscription is needed — the store is only ever read once, right
// after hydration; every SUBSEQUENT change flows through applyResolved
// below (a real setState call, but always invoked from an actual event
// callback — a click, a matchMedia 'change', a timer firing — never
// synchronously from a bare effect body) — so `subscribe` is a
// legitimate no-op, not a shortcut.
function subscribeNoop(): () => void {
  return () => {};
}
function getServerMode(): ThemeMode {
  return DEFAULT_THEME_MODE;
}
function getClientMode(): ThemeMode {
  const raw = extractCookieValue(document.cookie, THEME_COOKIE_NAME);
  return parseThemeCookie(raw)?.mode ?? DEFAULT_THEME_MODE;
}
function getServerResolvedTheme(): ResolvedTheme {
  return "light";
}
function getClientResolvedTheme(): ResolvedTheme {
  const domValue = document.documentElement.dataset.theme;
  return domValue === "light" || domValue === "dark" ? domValue : "light";
}

/**
 * Mounted exactly once, directly in the root layout (src/app/layout.tsx)
 * — every Aqenra surface (public site, auth, privacy/terms, the staff
 * app, Portal, Platform Admin) shares this single instance, since the
 * root layout is the one layout above all of them (confirmed by audit:
 * none of those route groups have their own competing layout that would
 * need a second provider). Never mount a second <ThemeProvider> anywhere
 * else in the tree.
 *
 * Takes no props: the root layout deliberately does NOT read the
 * `aqenra_theme` cookie server-side (reading a cookie in the root layout
 * would opt the entire app out of static prerendering — see layout.tsx's
 * own doc comment) and renders a generic `data-theme="light"` default
 * instead.
 *
 * The initial `mode`/`resolvedTheme` come from `useSyncExternalStore`
 * (getClientMode/getClientResolvedTheme vs. getServerMode/
 * getServerResolvedTheme above) rather than a lazy `useState` initializer
 * or a plain mount `useEffect`. Both of those were tried and both broke:
 * a lazy initializer reads the real cookie/DOM value immediately, which
 * differs from what the server rendered — a hydration TEXT mismatch
 * (React error #418) the moment anything renders `mode`/`resolvedTheme`
 * (confirmed by hitting it: even with `suppressHydrationWarning` on
 * `<html>`, which only protects that one element's OWN attribute, the
 * unrelated text mismatch made React discard and client-render the
 * whole subtree, silently undoing the pre-paint script's `data-theme`
 * correction as a side effect — exactly what node_modules/next/dist/
 * docs/01-app/02-guides/preventing-flash-before-hydration.md's own
 * "Understanding suppressHydrationWarning" section describes). A plain
 * mount effect avoids the mismatch but trips this repo's own
 * `react-hooks/set-state-in-effect` lint rule (setState called
 * synchronously from a bare effect body — see
 * src/components/search/use-global-search.ts's own comment on the same
 * rule). `useSyncExternalStore` is the React-provided primitive for
 * exactly this "external value differs between server and client"
 * case: it renders the server snapshot during hydration (matching
 * exactly, no mismatch) and lets React itself schedule the correction
 * to the real client snapshot immediately after — no manual
 * synchronization code, no lint violation.
 *
 * From then on, `override` (plain React state) is authoritative once
 * set — every real change (setMode, a live System/Automatic
 * resolution) writes to it, always from a genuine event callback, never
 * a bare effect body. `<html data-theme>` (corrected pre-paint, before
 * any of this) stays the actual visual source of truth throughout.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const externalMode = useSyncExternalStore(subscribeNoop, getClientMode, getServerMode);
  const externalResolvedTheme = useSyncExternalStore(subscribeNoop, getClientResolvedTheme, getServerResolvedTheme);

  const [override, setOverride] = useState<{ mode: ThemeMode; resolvedTheme: ResolvedTheme } | null>(null);

  const mode = override?.mode ?? externalMode;
  const resolvedTheme = override?.resolvedTheme ?? externalResolvedTheme;

  const applyResolved = useCallback((next: ResolvedTheme, currentMode: ThemeMode) => {
    document.documentElement.dataset.theme = next;
    writeThemeCookie(currentMode, next);
    setOverride({ mode: currentMode, resolvedTheme: next });
  }, []);

  const setMode = useCallback(
    (next: ThemeMode) => {
      const resolved = resolveTheme(next, { prefersDark: getPrefersDark(), now: new Date() });
      applyResolved(resolved, next);
    },
    [applyResolved],
  );

  // The one place a System matchMedia listener or an Automatic timer is
  // ever installed, keyed on `mode` — and, via the returned cleanup
  // function, the one place either is ever removed. React guarantees the
  // previous run's cleanup fires before this body runs again (on every
  // mode change, including every setMode() call, and once on unmount),
  // which makes "duplicate listener" and "stale listener after switching
  // away from System/Automatic" both structurally impossible rather than
  // something that has to be remembered to clean up correctly.
  useEffect(() => {
    if (mode === "system") {
      const mediaQuery = window.matchMedia(PREFERS_DARK_QUERY);
      const handleChange = (event: MediaQueryListEvent) => {
        applyResolved(resolveTheme("system", { prefersDark: event.matches, now: new Date() }), "system");
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    if (mode === "automatic") {
      let timer: ReturnType<typeof setTimeout>;
      const scheduleNext = () => {
        const ms = computeNextAutomaticTransitionMs(new Date());
        timer = setTimeout(() => {
          applyResolved(resolveTheme("automatic", { prefersDark: false, now: new Date() }), "automatic");
          scheduleNext();
        }, ms);
      };
      scheduleNext();
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [mode, applyResolved]);

  // Sleep/wake, background-tab throttling, a timezone change, DST, or a
  // manual clock change can all make a scheduled Automatic timer fire
  // late (browsers routinely throttle timers in backgrounded/sleeping
  // tabs) — this is the correctness backstop, not the timer above.
  // Re-resolves System too, for the same "the tab was asleep" reason,
  // even though System also has its own live `change` listener.
  useEffect(() => {
    if (mode !== "system" && mode !== "automatic") return undefined;

    const reEvaluate = () => {
      if (document.visibilityState !== "visible") return;
      applyResolved(resolveTheme(mode, { prefersDark: getPrefersDark(), now: new Date() }), mode);
    };

    document.addEventListener("visibilitychange", reEvaluate);
    window.addEventListener("focus", reEvaluate);
    return () => {
      document.removeEventListener("visibilitychange", reEvaluate);
      window.removeEventListener("focus", reEvaluate);
    };
  }, [mode, applyResolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
