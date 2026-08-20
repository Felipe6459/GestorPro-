import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { checkRateLimit, CRON_JOB_LIMIT } from "@/lib/rate-limit";
import { reconcileInvoicePdfArchiveObjects, BATCH_SIZE } from "@/lib/invoices/pdf/reconcile-archive-objects";

// Never statically cached/optimized — this must actually run, every time
// an authorized caller hits it.
export const dynamic = "force-dynamic";

// Bounded Archival Reconciliation/Cleanup — each claimed row costs up to
// two real Storage network round trips with no caller-controlled timeout
// (see reconcile-archive-objects.ts's own BATCH_SIZE doc comment). 60
// seconds is a deliberate operational ceiling for this route specifically
// — unrelated to the 900-second bound reconcile-archive-objects.ts uses
// for its own stale-uploader safety proof (CLEANUP_LEASE_MS is asserted,
// at module load, to exceed this exact value).
export const maxDuration = 60;

/**
 * Vercel Cron (once activated in a later, separate PR) or a manual
 * authorized call sends a GET with `Authorization: Bearer <CRON_SECRET>`.
 * No session, Membership, or portal cookie is ever read here — CRON_SECRET
 * is the entire auth boundary, checked once via the shared helper before
 * anything else runs. Not yet scheduled in vercel.json — this route is
 * deployed but dormant until a separate activation PR adds its schedule
 * entry, after a manual dry-run and one manual real invocation have both
 * been verified.
 */
export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  // Defense in depth only — CRON_SECRET is the real barrier. Bucketed by
  // this route's own fixed identifier, isolated from every other cron
  // job's own bucket (including this feature's own dry-run sibling).
  const limitCheck = checkRateLimit(CRON_JOB_LIMIT, "invoice-pdf-reconciliation");
  if (limitCheck.limited) {
    return NextResponse.json({ error: limitCheck.message }, { status: 429 });
  }

  const summary = await reconcileInvoicePdfArchiveObjects({ now: new Date(), batchSize: BATCH_SIZE });
  return NextResponse.json(summary);
}
