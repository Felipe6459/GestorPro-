/*
  Repairs the pre-existing defect where production Invoice create/update
  never wrote Invoice.organizationId, leaving it permanently NULL for every
  real (non-seeded) invoice. Three Analytics read paths
  (organization-metrics.ts, completion-metrics.ts, time-series.ts) query
  Invoice.organizationId directly and were silently undercounting as a
  result.

  This repository has no real customer history, so this repair is done as
  one atomic, self-verifying migration rather than a separate manually-run
  backfill script: guard against unresolvable/inconsistent data first,
  deterministically backfill only currently-null rows from
  Project.organizationId, verify, then apply the NOT NULL constraint and
  replace the foreign key with ON DELETE RESTRICT.

  Warnings:

  - Made the column `organizationId` on table `Invoice` required. This
    migration aborts loudly (RAISE EXCEPTION) instead of proceeding if any
    row cannot be safely resolved — it never guesses and never overwrites
    an existing non-null value that disagrees with its Project.

*/

-- Guard: abort before any write if any Invoice row cannot be safely
-- resolved — a missing Project relation (should be structurally
-- impossible: projectId is NOT NULL with an ON DELETE RESTRICT foreign
-- key, checked anyway as a defensive assertion), a Project with no
-- organizationId of its own, or an existing non-null Invoice.organizationId
-- that disagrees with its Project's organizationId. Never guessed, never
-- silently overwritten — matches prisma/backfill-organizations.ts's own
-- "report, never guess" precedent for this exact column, applied here as a
-- hard migration-time abort since there is no real customer data to leave
-- unresolved for later manual review.
DO $$
DECLARE
  unresolved_count integer;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
  FROM "Invoice" i
  LEFT JOIN "Project" p ON p.id = i."projectId"
  WHERE
    p.id IS NULL
    OR p."organizationId" IS NULL
    OR (i."organizationId" IS NOT NULL AND i."organizationId" != p."organizationId");

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Invoice.organizationId repair aborted: % invoice row(s) have a missing Project, a Project with no organizationId, or an existing Invoice.organizationId that disagrees with Project.organizationId. Resolve these rows manually before re-running this migration.', unresolved_count;
  END IF;
END $$;

-- Deterministic backfill: copy Project.organizationId into every
-- currently-null Invoice.organizationId row only. A row with an existing
-- non-null value is never touched here — the guard above already proved
-- none of those disagree with their Project.
UPDATE "Invoice" i
SET "organizationId" = p."organizationId"
FROM "Project" p
WHERE p.id = i."projectId"
  AND i."organizationId" IS NULL;

-- Verify: every row must be non-null before proceeding to the NOT NULL
-- constraint below. Defensive — the guard above already proved every row
-- is resolvable, so this should be unreachable.
DO $$
DECLARE
  remaining_null integer;
BEGIN
  SELECT COUNT(*) INTO remaining_null FROM "Invoice" WHERE "organizationId" IS NULL;
  IF remaining_null > 0 THEN
    RAISE EXCEPTION 'Invoice.organizationId repair aborted: % invoice row(s) still NULL after backfill — this should be unreachable given the guard above.', remaining_null;
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_organizationId_fkey";

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "organizationId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
