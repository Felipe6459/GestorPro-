/*
  Platform Admin Organization Suspension, PR 1 (schema + centralized
  enforcement + audit model; no mutation, no UI — see the design
  investigation, PLATFORM_ADMIN_ORGANIZATION_SUSPENSION_DESIGN, and this
  PR's own report for the full reasoning).

  Purely additive. Every statement below is exactly what this repository's
  own installed Prisma generates for this schema change, obtained via
  `prisma migrate diff --from-schema <pre-PR-schema> --to-schema
  <post-PR-schema> --script` (no database connection), never hand-guessed
  — the same provenance discipline `20260916090000_invoice_number_unique_
  per_organization`'s own migration already established for this project.

  No backfill, no UPDATE, no DELETE, no ALTER of any existing column, and
  no pre-alter verification guard is needed (unlike that migration): a new
  nullable column defaults every existing row to NULL automatically, and a
  new table starts empty. There is nothing here for a guard to protect
  against.

  - Organization.suspendedAt: nullable DateTime. NULL (every existing
    organization today) means active. A Platform Admin mutation setting
    this column ships in PR 2, not here — this PR only adds the column and
    the read-side enforcement that respects it.
  - PlatformAdminAuditAction / PlatformAdminAuditEvent: a new enum and a
    new, empty, append-only table. Deliberately not a foreign key to User
    for the acting admin (actorEmail is a plain TEXT column instead) — an
    allowlisted Platform Admin is authorized purely via an env-var
    allowlist (requirePlatformAdmin(), never a database row/Role) and is
    not guaranteed to have a User row at all. onDelete: CASCADE on
    organizationId matches every other Organization-scoped model in this
    schema — not a new precedent.
  - No row is ever written to PlatformAdminAuditEvent by this PR; nothing
    in the application yet references its enum's ORGANIZATION_REACTIVATED
    value either — both exist so PR 2's mutation can ship without a second
    migration.
*/

-- CreateEnum
CREATE TYPE "PlatformAdminAuditAction" AS ENUM ('ORGANIZATION_SUSPENDED', 'ORGANIZATION_REACTIVATED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlatformAdminAuditEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "action" "PlatformAdminAuditAction" NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "reasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdminAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAdminAuditEvent_organizationId_createdAt_idx" ON "PlatformAdminAuditEvent"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformAdminAuditEvent" ADD CONSTRAINT "PlatformAdminAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
