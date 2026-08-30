/*
  Aqenra Theme Persistence Phase C1a — MIGRATION ARTIFACT ONLY, migration-
  first rollout (see the Phase C architecture review and this PR's own
  report for the full reasoning).

  Purely additive. Every statement below is exactly what this repository's
  own installed Prisma generates for this schema change, obtained via
  `prisma migrate diff --from-schema <pre-PR-schema> --to-schema
  <post-PR-schema> --script` (no database connection), never hand-guessed
  — the same provenance discipline `20260917090000_add_platform_admin_
  organization_suspension`'s own migration already established for this
  project.

  Deliberately NOT paired with a schema.prisma change in this same PR
  (C1a). Theme Resolver Phase B's canonical identity queries —
  getOrCreateUser() (src/lib/current-user.ts) and resolvePortalIdentity()
  (src/lib/current-portal-user.ts) — call Prisma's findUnique/upsert with
  no explicit `select`, so they already return every scalar column the
  currently-generated Prisma Client knows about. If schema.prisma declared
  `themeMode` and Prisma Client were regenerated (via the existing
  `postinstall: prisma generate` hook) BEFORE this migration had been
  applied to Production, those same ~20 already-existing call sites would
  begin selecting a column that does not exist there yet — a hard,
  widespread runtime failure across nearly every authenticated request,
  not a graceful degradation. Since merges to `main` trigger an automatic
  Vercel Production deployment, schema.prisma must not carry this column
  until the Production database already has it.

  This migration is therefore the first of a three-stage rollout:
    C1a (this PR): migration artifact only — schema.prisma is unchanged,
      the generated Prisma Client is unchanged, no application code
      changes. Safe to merge and auto-deploy immediately: the currently
      running application never queries a `themeMode` column, so its
      behavior is entirely unaffected by this migration's mere presence
      in the repository. The migration itself is NOT applied to
      Production by this PR or its merge — only a separately authorized
      `prisma migrate deploy` (scripts/prisma-production.mjs) applies it.
    C1b (later, only once Production's database already has these
      columns): schema.prisma is updated to declare `User.themeMode` /
      `PortalUser.themeMode` — no behavior change, additive only.
    C2 (later): Server Actions, reconciliation, and any actual read/write
      of themeMode from application code.

  No backfill, no UPDATE, no DELETE, no ALTER of any existing column: a
  new NOT NULL column with a literal, constant default
  (`DEFAULT 'SYSTEM'`) back-fills every existing User/PortalUser row as
  part of the same DDL statement — there is nothing here for a separate
  backfill step to do, and no pre-alter verification guard is needed
  (mirroring `20260917090000_add_platform_admin_organization_suspension`'s
  own reasoning for its own defaulted/nullable additive columns).

  - ThemeMode: a new enum (LIGHT, DARK, SYSTEM, AUTOMATIC) — mirrors
    src/lib/theme/types.ts's own ThemeMode union exactly (the pre-paint
    script / cookie / ThemeProvider contract Theme Resolver Phase B
    already shipped and Production-verified; this migration does not
    change any of that runtime behavior).
  - User.themeMode / PortalUser.themeMode: NOT NULL, DEFAULT 'SYSTEM' —
    every existing row (staff and Portal identity alike) receives the
    same default a brand-new row would get if C2's future signup-seeding
    logic is never reached for it. Deliberately two separate identity
    tables, not a shared preferences table: see the Phase C architecture
    review's own reasoning (NotificationPreference is a separate table
    only because it is genuinely one-row-per-(user, type); themeMode is a
    single scalar per identity, so a join would be pure overhead).

  No other table, column, index, or constraint is touched by this
  migration. No external/staging/production database was touched
  applying this migration — it was only ever applied against this
  repo's local, ephemeral PGlite-backed test harness
  (test/support/local-postgres.ts) while authoring and verifying it.
*/

-- CreateEnum
CREATE TYPE "ThemeMode" AS ENUM ('LIGHT', 'DARK', 'SYSTEM', 'AUTOMATIC');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "themeMode" "ThemeMode" NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "PortalUser" ADD COLUMN     "themeMode" "ThemeMode" NOT NULL DEFAULT 'SYSTEM';
