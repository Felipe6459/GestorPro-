import { prisma } from "@/lib/prisma";
import { STALE_PENDING_THRESHOLD_MS } from "@/lib/invoices/email/send-invoice-email";

/**
 * §9 of docs/production-observability-runbook.md — the Platform Admin
 * aggregate page the manual runbook's own §9 named as the correct
 * eventual surface. Read-only by construction (see
 * check-platform-admin-security.mjs's own "no actions.ts" /
 * "no use server" / "no raw query" checks, all of which this file must
 * keep passing): no mutation, no retry, no remediation exists anywhere
 * in this module.
 *
 * Same enforcement convention as every other Platform Admin query
 * (organizations.ts, organization-detail.ts, platform-dashboard.ts):
 * requirePlatformAdmin() runs exactly once, in
 * (platform-admin)/layout.tsx, before any child page — this module is
 * never independently re-checked, on purpose (see the layout's own doc
 * comment on why the guard lives in exactly one place). That single
 * server-side redirect, not the absence of a nav link, is what actually
 * keeps a non-admin out; there is no client-reachable code path to this
 * module's functions that bypasses the layout.
 *
 * Why this file never uses `$queryRaw` for the InvoiceEmailAttempt
 * queries, even though a real PostgreSQL `DISTINCT ON` (exactly what
 * docs/production-observability-runbook.md's own Query C/D use) would
 * otherwise be the natural way to express "the latest attempt per
 * invoice": check-platform-admin-security.mjs's own check #4 forbids any
 * `$queryRaw`/`$executeRaw` anywhere under src/lib/platform-admin,
 * unconditionally. The deterministic-latest-per-invoice semantics are
 * reproduced in pure Prisma instead — fetch every InvoiceEmailAttempt
 * row in the 7-day window (invoiceId/status/failureReason/attemptedAt
 * only — never recipientEmail/id/providerMessageId/idempotencyKey/
 * requestedByUserId), ordered `[invoiceId, attemptedAt desc, id desc]`
 * (`id` is never selected — Prisma can order by a field it doesn't
 * select — only used as PostgreSQL's own tie-breaker for two attempts
 * sharing one attemptedAt), then keep the first row seen per invoiceId
 * while iterating that already-ordered list. This is byte-for-byte the
 * same result a `DISTINCT ON ("invoiceId") ORDER BY "invoiceId",
 * "attemptedAt" DESC, "id" DESC` query would produce — just computed in
 * application memory instead of by the database. `invoiceId` itself is
 * read into memory transiently, as the grouping key, but never appears
 * in this module's exported return type — see FailureMonitoringSummary
 * below, and the PR that introduced this file for the disclosed
 * performance tradeoff this implies at higher invoice-email volume
 * (docs/production-observability-runbook.md §10 already names the same
 * limitation for the manual SQL equivalent).
 */

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const WEBHOOK_STALE_PENDING_CUTOFF_MS = 60 * 60 * 1000;

export type WebhookFailureBucket = {
  /** null = a FAILED row with no failureCode recorded — a data-integrity anomaly, never silently dropped (see the reducer below). Never reachable via the current webhook route's own writer, which always sets one of its 4 fixed codes alongside FAILED — kept here defensively, the same "exhaustive, not just today's reachable set" discipline classifyOrganizationLifecycle's own INCOMPLETE branch already documents. */
  failureCode: string | null;
  count: number;
};

export type InvoiceEmailFailureBucket = {
  status: "FAILED" | "UNKNOWN";
  /** null = a terminal row with no failureReason recorded — a data-integrity anomaly, its own bounded group, never folded into another reason or dropped. */
  failureReason: string | null;
  count: number;
};

export type FailureMonitoringSummary = {
  windowStart: Date;
  generatedAt: Date;
  webhookFailuresByCode: WebhookFailureBucket[];
  webhookStalePendingCount: number;
  invoiceEmailFailuresByStatusAndReason: InvoiceEmailFailureBucket[];
  invoiceEmailStalePendingCount: number;
};

/** Every count this module produces comes from either a Prisma `count()`/`groupBy()._count` (already a plain JS number — no PostgreSQL bigint ever crosses the client boundary, since raw SQL is never used here) or an in-memory tally starting at 0. This is a defensive assertion that intent stays true, not a real bigint→number coercion — there is nothing here to coerce. */
function assertSafeCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Unexpected non-safe-integer aggregate count for ${label}`);
  }
  return value;
}

type LatestInvoiceEmailAttempt = { status: string; failureReason: string | null; attemptedAt: Date };

/** The DISTINCT ON-equivalent reduction described in this module's own header comment. Input must already be ordered `[invoiceId asc, attemptedAt desc, id desc]` — this function only keeps the first row it sees per invoiceId, it never re-sorts. */
function reduceToLatestPerInvoice(
  rows: { invoiceId: string; status: string; failureReason: string | null; attemptedAt: Date }[],
): Map<string, LatestInvoiceEmailAttempt> {
  const latestByInvoice = new Map<string, LatestInvoiceEmailAttempt>();
  for (const row of rows) {
    if (!latestByInvoice.has(row.invoiceId)) {
      latestByInvoice.set(row.invoiceId, { status: row.status, failureReason: row.failureReason, attemptedAt: row.attemptedAt });
    }
  }
  return latestByInvoice;
}

// ASCII-only, deliberately never a plausible real failureReason value
// (every real value in this app is a lowercase snake_case word, e.g.
// "provider_error" — never double-underscore-wrapped) — used only as an
// internal Map key to distinguish "no failureReason recorded" from every
// real string value, then translated back to a real `null` before this
// module returns anything.
const NULL_REASON_KEY = "__null__";

function summarizeLatestAttempts(
  latestByInvoice: Map<string, LatestInvoiceEmailAttempt>,
  staleCutoff: Date,
): { failuresByStatusAndReason: InvoiceEmailFailureBucket[]; stalePendingCount: number } {
  const bucketCounts = new Map<string, number>();
  let stalePendingCount = 0;

  for (const latest of latestByInvoice.values()) {
    if (latest.status === "FAILED" || latest.status === "UNKNOWN") {
      const reasonKey = latest.failureReason ?? NULL_REASON_KEY;
      const bucketKey = `${latest.status}|${reasonKey}`;
      bucketCounts.set(bucketKey, (bucketCounts.get(bucketKey) ?? 0) + 1);
    } else if (latest.status === "PENDING" && latest.attemptedAt < staleCutoff) {
      stalePendingCount += 1;
    }
    // ACCEPTED (or any other terminal status) is the intended, working
    // "later success suppresses older failures" outcome — no branch
    // needed, it simply contributes to neither bucket.
  }

  const failuresByStatusAndReason: InvoiceEmailFailureBucket[] = Array.from(bucketCounts.entries())
    .map(([bucketKey, count]) => {
      const separatorIndex = bucketKey.indexOf("|");
      const status = bucketKey.slice(0, separatorIndex) as "FAILED" | "UNKNOWN";
      const reasonKey = bucketKey.slice(separatorIndex + 1);
      return {
        status,
        failureReason: reasonKey === NULL_REASON_KEY ? null : reasonKey,
        count: assertSafeCount(count, "invoiceEmailFailuresByStatusAndReason"),
      };
    })
    .sort((a, b) => a.status.localeCompare(b.status) || (a.failureReason ?? "").localeCompare(b.failureReason ?? ""));

  return { failuresByStatusAndReason, stalePendingCount: assertSafeCount(stalePendingCount, "invoiceEmailStalePendingCount") };
}

/**
 * Read-only, bounded, aggregate-only durable-failure summary — the exact
 * four queries docs/production-observability-runbook.md §6 already
 * documents as manual SQL, now computed the same way for a Platform
 * Admin page. `now` is injectable only for deterministic testing (the
 * same convention getPlatformDashboardData(now) and
 * cleanupNotifications({ now, ... }) already use) — the caller is always
 * this module's own page, never a client-supplied value; there is no
 * request parameter anywhere in this file that could widen the window.
 */
export async function getFailureMonitoringSummary(now: Date = new Date()): Promise<FailureMonitoringSummary> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const webhookStaleCutoff = new Date(now.getTime() - WEBHOOK_STALE_PENDING_CUTOFF_MS);
  const invoiceEmailStaleCutoff = new Date(now.getTime() - STALE_PENDING_THRESHOLD_MS);

  const [webhookFailureGroups, webhookStalePendingCount, invoiceEmailAttemptRows] = await Promise.all([
    prisma.webhookEvent.groupBy({
      by: ["failureCode"],
      where: { processingStatus: "FAILED", createdAt: { gte: windowStart, lte: now } },
      _count: true,
    }),
    prisma.webhookEvent.count({
      where: { processingStatus: "PENDING", createdAt: { gte: windowStart, lt: webhookStaleCutoff } },
    }),
    prisma.invoiceEmailAttempt.findMany({
      where: { attemptedAt: { gte: windowStart, lte: now } },
      select: { invoiceId: true, status: true, failureReason: true, attemptedAt: true },
      orderBy: [{ invoiceId: "asc" }, { attemptedAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const webhookFailuresByCode: WebhookFailureBucket[] = webhookFailureGroups
    .map((group) => ({ failureCode: group.failureCode, count: assertSafeCount(group._count, "webhookFailuresByCode") }))
    .sort((a, b) => (a.failureCode ?? "").localeCompare(b.failureCode ?? ""));

  const latestByInvoice = reduceToLatestPerInvoice(invoiceEmailAttemptRows);
  const { failuresByStatusAndReason, stalePendingCount } = summarizeLatestAttempts(latestByInvoice, invoiceEmailStaleCutoff);

  return {
    windowStart,
    generatedAt: now,
    webhookFailuresByCode,
    webhookStalePendingCount: assertSafeCount(webhookStalePendingCount, "webhookStalePendingCount"),
    invoiceEmailFailuresByStatusAndReason: failuresByStatusAndReason,
    invoiceEmailStalePendingCount: stalePendingCount,
  };
}
