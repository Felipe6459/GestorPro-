import {
  AUTOMATIC_DARK_START_MINUTES,
  AUTOMATIC_LIGHT_START_MINUTES,
  DEFAULT_THEME_MODE,
  RESOLVED_THEMES,
  THEME_MODES,
  type ResolvedTheme,
  type ThemeMode,
} from "./types";

/**
 * Aqenra Theme Resolver Phase B — pure resolution logic.
 *
 * Every function here is a plain function of its arguments: none of them
 * read `Date.now()`, `window.matchMedia`, or `document.cookie` directly.
 * The caller (root layout, the pre-paint script, ThemeProvider) is always
 * the one that supplies `now`/`prefersDark`/the raw cookie string — which
 * is what makes every case in this module (including the Automatic
 * day/night boundary and the next-transition rollover math) testable with
 * a handful of plain, deterministic unit tests instead of anything
 * time-dependent or DOM-dependent.
 *
 * Cookie contract (aqenra_theme): value is `${mode}.${resolved}` — e.g.
 * `light.light`, `system.dark`, `automatic.light`. Both halves are
 * validated against a fixed allowlist by parseThemeCookie; anything else
 * (missing, malformed, an unknown mode/resolved word, extra `.`-segments)
 * parses to `null` and the caller falls back to the documented default
 * (DEFAULT_THEME_MODE for mode, "light" for a not-yet-known resolved
 * value — see root layout's own comment for why "light" specifically).
 * This cookie is deliberately non-sensitive: it stores only ThemeMode/
 * ResolvedTheme strings, never a user id, org id, email, timezone, or
 * location — and it is the one deliberate httpOnly:false exception in
 * this codebase (every other cookie here is httpOnly — see
 * src/lib/supabase/cookie-options.ts and current-user.ts's
 * ACTIVE_ORG_COOKIE), specifically because the pre-paint script and the
 * client ThemeProvider both need to read/write it before/without a
 * server round-trip. It must never be reused to carry auth/session data.
 */

function isThemeMode(value: string): value is ThemeMode {
  return (THEME_MODES as readonly string[]).includes(value);
}

function isResolvedTheme(value: string): value is ResolvedTheme {
  return (RESOLVED_THEMES as readonly string[]).includes(value);
}

/** Strict allowlist parse. Anything not exactly one of the four known modes fails closed to DEFAULT_THEME_MODE. */
export function parseThemeMode(value: unknown): ThemeMode {
  return typeof value === "string" && isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

export type ParsedThemeCookie = { mode: ThemeMode; resolved: ResolvedTheme };

/**
 * Strict allowlist parse of the raw `aqenra_theme` cookie value. Returns
 * `null` — never throws, never partially trusts a malformed value — for
 * anything that isn't exactly `<mode>.<resolved>` with both halves on
 * their respective allowlists.
 */
export function parseThemeCookie(raw: string | undefined | null): ParsedThemeCookie | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [modeRaw, resolvedRaw] = parts;
  if (!isThemeMode(modeRaw) || !isResolvedTheme(resolvedRaw)) return null;
  return { mode: modeRaw, resolved: resolvedRaw };
}

export function serializeThemeCookie(mode: ThemeMode, resolved: ResolvedTheme): string {
  return `${mode}.${resolved}`;
}

/**
 * Extracts a single named cookie's value out of a raw `document.cookie`-
 * shaped header string (e.g. `"a=1; aqenra_theme=system.dark; b=2"`).
 * Pure — takes the header string as a parameter rather than reading
 * `document.cookie` itself, so it's testable without a DOM (see
 * ThemeProvider, the only real caller, for the actual `document.cookie`
 * read). Mirrors the same regex the pre-paint script uses inline (see
 * pre-paint-script.ts) — kept as two separate implementations
 * deliberately: the pre-paint script cannot import from this module (it
 * runs before any bundled JS/module has loaded), so this is the
 * TypeScript-side equivalent used once hydration begins.
 */
export function extractCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The Automatic day/night boundary, compared in minutes-since-local-
 * midnight so it lines up exactly with `Date#getHours()/getMinutes()` —
 * 07:00 is inclusive-light, 19:00 is inclusive-dark (i.e. exclusive-light).
 */
export function resolveAutomaticFromDate(now: Date): ResolvedTheme {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= AUTOMATIC_LIGHT_START_MINUTES && minutes < AUTOMATIC_DARK_START_MINUTES
    ? "light"
    : "dark";
}

function atLocalMinuteOfDay(base: Date, minutesSinceMidnight: number, dayOffset: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(0, minutesSinceMidnight, 0, 0);
  return d;
}

/**
 * Milliseconds until the next Automatic transition (07:00 or 19:00,
 * local time), handling every rollover case: before 07:00 (→ today's
 * 07:00), between 07:00 and 19:00 (→ today's 19:00), after 19:00 (→
 * tomorrow's 07:00) — and the exact-boundary instant itself, where the
 * next transition is always the FOLLOWING one, never the same instant
 * again (candidates are filtered by strictly-greater-than `now`, so
 * calling this again from inside the timer that just fired at 07:00:00
 * correctly schedules 19:00 next, not another immediate 07:00 firing).
 * Uses `Date`'s local setters throughout, so DST and any other local
 * wall-clock quirk are handled the same way the platform's own local
 * time already handles them — nothing here special-cases DST.
 */
export function computeNextAutomaticTransitionMs(now: Date): number {
  const candidates = [
    atLocalMinuteOfDay(now, AUTOMATIC_LIGHT_START_MINUTES, 0),
    atLocalMinuteOfDay(now, AUTOMATIC_DARK_START_MINUTES, 0),
    atLocalMinuteOfDay(now, AUTOMATIC_LIGHT_START_MINUTES, 1),
  ];
  const nowMs = now.getTime();
  // candidates[2] (tomorrow's light-start) is always strictly in the
  // future relative to `now`, so `next` below is never undefined in
  // practice — the `?? candidates[2]` fallback exists only so TypeScript
  // doesn't need a non-null assertion, not because that branch is
  // actually reachable.
  const next = candidates.find((candidate) => candidate.getTime() > nowMs) ?? candidates[2];
  return next.getTime() - nowMs;
}

/**
 * The single top-level resolver: given a mode and the live signals only
 * the caller can supply (the OS color-scheme preference, the current
 * local time), returns the ResolvedTheme that should be visually active.
 * `light`/`dark` ignore both signals entirely (an explicit choice never
 * depends on the OS or the clock) — passing dummy values for the signal
 * that mode doesn't use is always safe.
 */
export function resolveTheme(
  mode: ThemeMode,
  signals: { prefersDark: boolean; now: Date },
): ResolvedTheme {
  switch (mode) {
    case "light":
      return "light";
    case "dark":
      return "dark";
    case "system":
      return signals.prefersDark ? "dark" : "light";
    case "automatic":
      return resolveAutomaticFromDate(signals.now);
  }
}
