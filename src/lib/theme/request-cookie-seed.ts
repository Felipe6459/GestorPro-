import { cookies } from "next/headers";
import { parseThemeCookie } from "./resolve";
import { DEFAULT_THEME_MODE, THEME_COOKIE_NAME } from "./types";
import { runtimeModeToDbThemeMode } from "./db-mode";
import { ThemeMode as DbThemeMode } from "@/generated/prisma/enums";

/**
 * Aqenra Theme Persistence Phase C2. Reads the CURRENT request's
 * `aqenra_theme` cookie and returns ONLY the validated `mode` component,
 * mapped to Prisma's `ThemeMode` enum — for seeding a brand-new
 * `User`/`PortalUser` row at the exact moment it is first created (see
 * `current-user.ts`'s `getOrCreateUser()` and `portal/invite/[token]/
 * actions.ts`'s `acceptClientInvitationAction`, the only two call sites).
 *
 * Deliberately reuses `parseThemeCookie` from `./resolve` — the exact
 * same strict allowlist parser the pre-paint script/ThemeProvider already
 * use — rather than a second cookie grammar. Never reads the cached
 * `resolved` half: that value is a point-in-time computation from this
 * device's clock/OS preference at the moment the cookie was last
 * written, not a preference, and must never become durable (see
 * `db-mode.ts`'s own doc comment). Missing or malformed cookie fails
 * closed to `DEFAULT_THEME_MODE` ("system"), exactly like every other
 * consumer of this cookie in this app.
 *
 * Must only be called from a context where `cookies()` is already
 * legitimately dynamic — an authenticated Server Action or an
 * already-dynamic authenticated Server Component. Never call this from
 * the public root layout, which stays free of `cookies()`/DB reads for
 * theme purposes entirely (see `layout.tsx`'s own doc comment on why
 * that would opt the whole app out of static prerendering).
 *
 * Deliberately does NOT `import "server-only"`: this module is imported
 * by `current-user.ts`'s `getOrCreateUser()`, and current-user.ts's own
 * dependency graph is kept free of that marker specifically so its many
 * existing unit tests never need to mock it (see
 * `organization-access.ts`'s own doc comment for the exact same
 * precedent/reasoning). `cookies()` itself is a safe, ordinary Next.js
 * import; only actually CALLING this function outside a real request
 * context would fail, which no unit test does.
 */
export async function seedThemeModeFromRequestCookie(): Promise<DbThemeMode> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const mode = parseThemeCookie(raw)?.mode ?? DEFAULT_THEME_MODE;
  return runtimeModeToDbThemeMode(mode);
}
