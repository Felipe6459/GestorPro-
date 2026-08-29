/**
 * Aqenra Theme Resolver Phase B — shared contract.
 *
 * `ThemeMode` is what the user (eventually, via a future Settings →
 * Appearance page — not part of this PR) actually chooses. `ResolvedTheme`
 * is the ONLY thing that ever drives visual tokens: it's written to
 * `<html data-theme>` and nothing else in the app is allowed to branch on
 * `mode` for visual purposes (see design-system-foundation-tokens.test.ts
 * and PR #144/#145's own token architecture, which already assumes this
 * exact two-layer split).
 *
 * Values are lowercase throughout — cookie value, TypeScript union, and
 * the DOM attribute all use the same casing, so there is no
 * upper/lower-case translation layer anywhere in this feature.
 */
export type ThemeMode = "light" | "dark" | "system" | "automatic";
export type ResolvedTheme = "light" | "dark";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system", "automatic"];
export const RESOLVED_THEMES: readonly ResolvedTheme[] = ["light", "dark"];

/** Fail-closed default whenever a stored/supplied mode can't be trusted. */
export const DEFAULT_THEME_MODE: ThemeMode = "system";

/**
 * The one non-sensitive appearance-preference cookie for this feature.
 * See resolve.ts's top-of-file comment for the full format/options
 * contract — this constant is the single source of truth for the name,
 * shared by the server (root layout), the pre-paint script, and the
 * client ThemeProvider, so all three can never drift apart.
 */
export const THEME_COOKIE_NAME = "aqenra_theme";

/**
 * Approved Automatic launch rule (owner-approved, no configurability at
 * launch — see the theme-architecture spec): 07:00 inclusive through
 * 19:00 exclusive is Light; everything else is Dark. Expressed in
 * minutes-since-local-midnight so both the boundary check and the
 * next-transition calculation compare against the exact same unit as
 * `Date#getHours()`/`getMinutes()`.
 */
export const AUTOMATIC_LIGHT_START_HOUR = 7;
export const AUTOMATIC_DARK_START_HOUR = 19;
export const AUTOMATIC_LIGHT_START_MINUTES = AUTOMATIC_LIGHT_START_HOUR * 60;
export const AUTOMATIC_DARK_START_MINUTES = AUTOMATIC_DARK_START_HOUR * 60;
