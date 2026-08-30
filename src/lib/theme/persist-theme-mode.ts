import "server-only";
import { prisma } from "@/lib/prisma";
import type { ThemeMode as DbThemeMode } from "@/generated/prisma/enums";

/**
 * Aqenra Theme Persistence Phase C2. The only two places a `themeMode`
 * column is ever WRITTEN from application code (seeding a brand-new row
 * is handled separately, inline at each creation site — see
 * `request-cookie-seed.ts`). Both take an already-resolved identity id
 * and trust it completely: identity resolution/authorization is the
 * exclusive responsibility of each Server Action that calls these (see
 * `(dashboard)/theme-actions.ts` and `portal/(app)/theme-actions.ts`),
 * never this module — kept as two small, separately-named functions
 * rather than one generic `write(table, id, mode)` dispatcher, so a typo
 * or a copy-paste mistake can never accidentally target the wrong table.
 */
export async function writeUserThemeMode(userId: string, mode: DbThemeMode): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { themeMode: mode } });
}

export async function writePortalUserThemeMode(portalUserId: string, mode: DbThemeMode): Promise<void> {
  await prisma.portalUser.update({ where: { id: portalUserId }, data: { themeMode: mode } });
}
