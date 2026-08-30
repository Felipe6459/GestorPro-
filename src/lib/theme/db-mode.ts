import { ThemeMode as DbThemeMode } from "@/generated/prisma/enums";
import type { ThemeMode } from "./types";

/**
 * Aqenra Theme Persistence Phase C2 — the one place Prisma's `ThemeMode`
 * enum (`LIGHT`/`DARK`/`SYSTEM`/`AUTOMATIC`, the durable DB representation
 * — see `20260918090000_add_theme_mode_columns`) and this feature's own
 * runtime `ThemeMode` union (`light`/`dark`/`system`/`automatic` — see
 * `./types`, the cookie/pre-paint-script/ThemeProvider contract Theme
 * Resolver Phase B already shipped) are ever converted between each
 * other. Every other module that needs this conversion imports these two
 * functions rather than writing its own string mapping — there is
 * exactly one translation table for this, not one per call site.
 *
 * Both tables are keyed by their full respective union type, so
 * TypeScript itself enforces exhaustiveness: adding a fifth mode to
 * either union without updating both tables here is a compile error, not
 * a silent runtime gap or an "impossible" default branch to reason
 * about.
 *
 * Deliberately has no notion of `ResolvedTheme` at all — only `mode` is
 * ever persisted (see request-cookie-seed.ts's own doc comment for why
 * `resolvedTheme` never reaches the database).
 */
const DB_TO_RUNTIME: Record<DbThemeMode, ThemeMode> = {
  [DbThemeMode.LIGHT]: "light",
  [DbThemeMode.DARK]: "dark",
  [DbThemeMode.SYSTEM]: "system",
  [DbThemeMode.AUTOMATIC]: "automatic",
};

const RUNTIME_TO_DB: Record<ThemeMode, DbThemeMode> = {
  light: DbThemeMode.LIGHT,
  dark: DbThemeMode.DARK,
  system: DbThemeMode.SYSTEM,
  automatic: DbThemeMode.AUTOMATIC,
};

export function dbThemeModeToRuntimeMode(dbMode: DbThemeMode): ThemeMode {
  return DB_TO_RUNTIME[dbMode];
}

export function runtimeModeToDbThemeMode(mode: ThemeMode): DbThemeMode {
  return RUNTIME_TO_DB[mode];
}
