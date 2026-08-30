"use server";

import { getCurrentPortalUser } from "@/lib/current-portal-user";
import { isThemeMode } from "@/lib/theme/resolve";
import type { ThemeMode } from "@/lib/theme/types";
import { runtimeModeToDbThemeMode } from "@/lib/theme/db-mode";
import { writePortalUserThemeMode } from "@/lib/theme/persist-theme-mode";

/**
 * Aqenra Theme Persistence Phase C2 — Portal theme-preference persistence.
 * Deliberately a separate action from `(dashboard)/theme-actions.ts`'s
 * `updateThemeModeAction`, even though the two bodies are almost
 * identical: two thin, separately-exported entrypoints that each derive
 * identity through their own existing, already-audited identity resolver
 * (`getCurrentPortalUser()` here, `getOrCreateUser()` there) before
 * delegating to the shared internal write helper — never one action that
 * tries to guess which identity type it's dealing with. Portal and staff
 * identities are structurally independent everywhere else in this app
 * (see `current-portal-user.ts`'s own doc comments); this keeps that true
 * for theme persistence too.
 *
 * The client never supplies (and this never trusts) a portalUserId: it
 * can only ever update the calling identity's own row.
 */
export async function updatePortalThemeModeAction(mode: ThemeMode): Promise<void> {
  if (!isThemeMode(mode)) {
    throw new Error("Invalid theme mode.");
  }

  const { portalUser } = await getCurrentPortalUser();
  await writePortalUserThemeMode(portalUser.id, runtimeModeToDbThemeMode(mode));
}
