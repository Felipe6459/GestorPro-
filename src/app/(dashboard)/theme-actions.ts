"use server";

import { getOrCreateUser } from "@/lib/current-user";
import { isThemeMode } from "@/lib/theme/resolve";
import type { ThemeMode } from "@/lib/theme/types";
import { runtimeModeToDbThemeMode } from "@/lib/theme/db-mode";
import { writeUserThemeMode } from "@/lib/theme/persist-theme-mode";

/**
 * Aqenra Theme Persistence Phase C2 — staff theme-preference persistence.
 * Not wired to any UI yet (no Settings → Appearance page exists); exists
 * so `ThemeProvider`'s future authenticated persistence helper (Phase D)
 * has a real, narrowly-scoped Server Action to call.
 *
 * Identity is derived server-side via `getOrCreateUser()` alone —
 * deliberately NOT `getCurrentUserOrganization()`, which additionally
 * resolves (and, for a first-time caller, auto-provisions) an active
 * Organization/Membership. A theme preference is personal, never
 * organization-scoped (see the Phase C architecture review), so paying
 * for organization resolution here would be both unnecessary work and a
 * subtle invitation to accidentally scope this by organization later —
 * this action has no organizationId in scope at all, by construction.
 *
 * The client never supplies (and this never trusts) a userId: it can
 * only ever update the calling identity's own row. `isThemeMode` rejects
 * a forged/invalid string outright rather than silently coercing it.
 */
export async function updateThemeModeAction(mode: ThemeMode): Promise<void> {
  if (!isThemeMode(mode)) {
    throw new Error("Invalid theme mode.");
  }

  const user = await getOrCreateUser();
  await writeUserThemeMode(user.id, runtimeModeToDbThemeMode(mode));
}
