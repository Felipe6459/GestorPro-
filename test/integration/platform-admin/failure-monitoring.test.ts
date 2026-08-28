import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { getFailureMonitoringSummary } from "@/lib/platform-admin/queries/failure-monitoring";
import { MAX_CLEANUP_ATTEMPTS } from "@/lib/invoices/pdf/reconcile-archive-objects";
import { setMockAuthUser, resetAuthMock } from "../../support/auth-mock";

// PLATFORM_ADMIN_EXECUTION_AUTHORIZATION_AUDIT correction:
// getFailureMonitoringSummary() now calls requirePlatformAdmin() as its
// own first awaited operation (previously relied solely on the layout —
// see the query module's own doc comment), so every call in this file
// needs a real allowlisted mock identity, or it now redirects instead of
// returning a summary. Fixed, file-local email — never a real address.
const PLATFORM_ADMIN_TEST_EMAIL = "platform-admin-failure-monitoring-test@example.com";
const ORIGINAL_PLATFORM_ADMIN_EMAILS = process.env.PLATFORM_ADMIN_EMAILS;

/**
 * §9 of docs/production-observability-runbook.md — proves
 * getFailureMonitoringSummary() reproduces the exact aggregate semantics
 * that document's own manual SQL (Query A–D) already specifies, against
 * the real repository database harness (PGlite).
 *
 * getFailureMonitoringSummary() has no organization scoping at all — it
 * is deliberately platform-wide (see its own header comment) — so every
 * fixture in this file is anchored to a fixed reference instant far in
 * the past (REFERENCE_NOW, year 2020) rather than the real wall clock.
 * No other test in this repository ever backdates a WebhookEvent/
 * InvoiceEmailAttempt row's timestamp into the past; every other test's
 * fixtures are written at whatever the real "now" is when the suite
 * actually runs. Anchoring this file's own 7-day window around a fixed
 * 2020 instant therefore makes every count in this file exact and
 * collision-free against the shared test database, without needing a
 * before/after delta technique.
 */

const REFERENCE_NOW = new Date("2020-01-01T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Same technique this engagement's own diagnostic tests already
// established (see billing-diagnostics.test.ts's own MARKERS constant) —
// deliberately identifiable values planted in every field a leak could
// plausibly come from, asserted absent from the summary's own JSON.
const MARKERS = {
  recipientEmail: "marker-recipient@example-marker-domain.test",
};

const WEBHOOK_EVENT_ID_PREFIX = "evt_failure-monitoring-test";
const INVOICE_NUMBER_PREFIX = "INV-FAILURE-MONITORING";
const ARCHIVE_OBJECT_STORAGE_PATH_PREFIX = "test-archive/failure-monitoring";

const createdWebhookEventIds: string[] = [];
const createdInvoiceIds: string[] = [];
const createdArchiveObjectIds: string[] = [];

async function seedWebhookEvent(overrides: {
  processingStatus?: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED";
  failureCode?: string | null;
  createdAt: Date;
  organizationId?: string | null;
}) {
  const event = await prisma.webhookEvent.create({
    data: {
      provider: "PADDLE",
      providerEventId: `${WEBHOOK_EVENT_ID_PREFIX}-${randomUUID()}`,
      eventType: "subscription.updated",
      eventCreatedAt: overrides.createdAt,
      createdAt: overrides.createdAt,
      processingStatus: overrides.processingStatus ?? "PENDING",
      failureCode: overrides.failureCode ?? null,
      organizationId: overrides.organizationId ?? null,
    },
  });
  createdWebhookEventIds.push(event.id);
  return event;
}

async function seedPlainInvoice(fixtures: TestFixtures) {
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}-${randomUUID().slice(0, 8)}`,
      status: "SENT",
      amount: "100.00",
      subtotal: "100.00",
      discountAmount: "0.00",
      taxAmount: "0.00",
      projectId: fixtures.project.id,
      clientId: fixtures.clientA.id,
      organizationId: fixtures.orgA.id,
    },
  });
  createdInvoiceIds.push(invoice.id);
  return invoice;
}

async function seedAttempt(
  invoiceId: string,
  overrides: {
    id?: string;
    status?: "PENDING" | "ACCEPTED" | "FAILED" | "UNKNOWN";
    failureReason?: string | null;
    attemptedAt: Date;
  },
) {
  return prisma.invoiceEmailAttempt.create({
    data: {
      id: overrides.id,
      invoiceId,
      recipientEmail: MARKERS.recipientEmail,
      status: overrides.status ?? "PENDING",
      failureReason: overrides.failureReason,
      idempotencyKey: randomUUID(),
      attemptedAt: overrides.attemptedAt,
    },
  });
}

async function seedArchiveObject(
  fixtures: TestFixtures,
  overrides: {
    status?: "PENDING_UPLOAD" | "REFERENCED" | "CLEANUP_PENDING" | "CLEANED";
    cleanupAttemptCount?: number;
    cleanupLockedAt?: Date | null;
    cleanupClaimToken?: string | null;
  },
) {
  const id = randomUUID();
  const row = await prisma.invoicePdfArchiveObject.create({
    data: {
      id,
      organizationId: fixtures.orgA.id,
      documentVersion: 1,
      storagePath: `${ARCHIVE_OBJECT_STORAGE_PATH_PREFIX}/${id}.pdf`,
      status: overrides.status ?? "PENDING_UPLOAD",
      cleanupAttemptCount: overrides.cleanupAttemptCount ?? 0,
      cleanupLockedAt: overrides.cleanupLockedAt ?? null,
      cleanupClaimToken: overrides.cleanupClaimToken ?? null,
    },
  });
  createdArchiveObjectIds.push(row.id);
  return row;
}

describe("getFailureMonitoringSummary — §9 Platform Admin Observability", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
    process.env.PLATFORM_ADMIN_EMAILS = PLATFORM_ADMIN_TEST_EMAIL;
    setMockAuthUser({ id: randomUUID(), email: PLATFORM_ADMIN_TEST_EMAIL });
  });

  afterAll(async () => {
    if (createdArchiveObjectIds.length > 0) {
      // Restrict-referenced by Organization — must be deleted before
      // cleanupTestData(fixtures) below removes fixtures.orgA.
      await prisma.invoicePdfArchiveObject.deleteMany({ where: { id: { in: createdArchiveObjectIds } } });
    }
    if (createdInvoiceIds.length > 0) {
      await prisma.invoiceEmailAttempt.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    }
    if (createdWebhookEventIds.length > 0) {
      await prisma.webhookEvent.deleteMany({ where: { id: { in: createdWebhookEventIds } } });
    }
    await cleanupTestData(fixtures);
    resetAuthMock();
    if (ORIGINAL_PLATFORM_ADMIN_EMAILS === undefined) {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    } else {
      process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL_PLATFORM_ADMIN_EMAILS;
    }
  });

  describe("WebhookEvent FAILED grouping (Query A)", () => {
    it("groups FAILED rows by every closed failureCode, within the 7-day window, excluding older rows", async () => {
      await seedWebhookEvent({ processingStatus: "FAILED", failureCode: "missing_organization", createdAt: new Date(REFERENCE_NOW.getTime() - 2 * DAY_MS) });
      await seedWebhookEvent({ processingStatus: "FAILED", failureCode: "missing_organization", createdAt: new Date(REFERENCE_NOW.getTime() - 3 * DAY_MS) });
      await seedWebhookEvent({ processingStatus: "FAILED", failureCode: "unknown_organization", createdAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS) });
      await seedWebhookEvent({ processingStatus: "FAILED", failureCode: "provider_id_conflict", createdAt: new Date(REFERENCE_NOW.getTime() - 6 * DAY_MS) });
      await seedWebhookEvent({ processingStatus: "FAILED", failureCode: "malformed_event", createdAt: new Date(REFERENCE_NOW.getTime() - 5 * DAY_MS) });
      // Outside the 7-day window — must be excluded.
      await seedWebhookEvent({ processingStatus: "FAILED", failureCode: "malformed_event", createdAt: new Date(REFERENCE_NOW.getTime() - 10 * DAY_MS) });
      // PROCESSED/IGNORED — never counted as a failure, regardless of window.
      await seedWebhookEvent({ processingStatus: "PROCESSED", createdAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS) });
      await seedWebhookEvent({ processingStatus: "IGNORED", createdAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS) });

      const summary = await getFailureMonitoringSummary(REFERENCE_NOW);
      const byCode = Object.fromEntries(summary.webhookFailuresByCode.map((b) => [b.failureCode, b.count]));

      expect(byCode["missing_organization"]).toBe(2);
      expect(byCode["unknown_organization"]).toBe(1);
      expect(byCode["provider_id_conflict"]).toBe(1);
      expect(byCode["malformed_event"]).toBe(1);
      expect(summary.webhookFailuresByCode).toHaveLength(4);
    });

    it("surfaces a null failureCode as its own explicit anomaly bucket, never dropped", async () => {
      await seedWebhookEvent({ processingStatus: "FAILED", failureCode: null, createdAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS) });

      const summary = await getFailureMonitoringSummary(REFERENCE_NOW);
      const nullBucket = summary.webhookFailuresByCode.find((b) => b.failureCode === null);

      expect(nullBucket).toBeDefined();
      expect(nullBucket!.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe("WebhookEvent stale PENDING (Query B)", () => {
    it("counts only PENDING rows strictly between the 7-day window start and the 1-hour cutoff", async () => {
      // Too recent — must be excluded.
      await seedWebhookEvent({ processingStatus: "PENDING", createdAt: new Date(REFERENCE_NOW.getTime() - 30 * 60 * 1000) });
      // Stale — must be included.
      await seedWebhookEvent({ processingStatus: "PENDING", createdAt: new Date(REFERENCE_NOW.getTime() - 3 * HOUR_MS) });
      await seedWebhookEvent({ processingStatus: "PENDING", createdAt: new Date(REFERENCE_NOW.getTime() - 2 * DAY_MS) });
      // Outside the 7-day window — must be excluded.
      await seedWebhookEvent({ processingStatus: "PENDING", createdAt: new Date(REFERENCE_NOW.getTime() - 9 * DAY_MS) });

      const summary = await getFailureMonitoringSummary(REFERENCE_NOW);

      expect(summary.webhookStalePendingCount).toBe(2);
    });
  });

  describe("InvoiceEmailAttempt latest-per-invoice failures (Query C)", () => {
    it("counts the latest FAILED and latest UNKNOWN attempts separately, each once per invoice", async () => {
      const invoiceFailed = await seedPlainInvoice(fixtures);
      await seedAttempt(invoiceFailed.id, { status: "FAILED", failureReason: "provider_error", attemptedAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS) });

      const invoiceUnknown = await seedPlainInvoice(fixtures);
      await seedAttempt(invoiceUnknown.id, { status: "UNKNOWN", failureReason: "provider_outcome_unknown", attemptedAt: new Date(REFERENCE_NOW.getTime() - 4 * HOUR_MS) });

      const summary = await getFailureMonitoringSummary(REFERENCE_NOW);
      const failedBucket = summary.invoiceEmailFailuresByStatusAndReason.find((b) => b.status === "FAILED" && b.failureReason === "provider_error");
      const unknownBucket = summary.invoiceEmailFailuresByStatusAndReason.find((b) => b.status === "UNKNOWN" && b.failureReason === "provider_outcome_unknown");

      expect(failedBucket?.count).toBe(1);
      expect(unknownBucket?.count).toBe(1);
    });

    it("a later ACCEPTED attempt fully suppresses an earlier FAILED attempt for the same invoice, and a historical older attempt is excluded once a newer terminal attempt exists — proven by an isolated before/after delta", async () => {
      const invoice = await seedPlainInvoice(fixtures);
      const before = await getFailureMonitoringSummary(REFERENCE_NOW);
      const beforeCount = sumAllCounts(before.invoiceEmailFailuresByStatusAndReason);

      await seedAttempt(invoice.id, { status: "FAILED", failureReason: "provider_error", attemptedAt: new Date(REFERENCE_NOW.getTime() - 3 * DAY_MS) });
      const afterFailed = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(sumAllCounts(afterFailed.invoiceEmailFailuresByStatusAndReason)).toBe(beforeCount + 1);

      await seedAttempt(invoice.id, { status: "ACCEPTED", attemptedAt: new Date(REFERENCE_NOW.getTime() - 2 * DAY_MS) });
      const afterAccepted = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(sumAllCounts(afterAccepted.invoiceEmailFailuresByStatusAndReason)).toBe(beforeCount);
    });

    it("null failureReason on a latest FAILED/UNKNOWN row remains visible as its own anomaly bucket", async () => {
      const invoice = await seedPlainInvoice(fixtures);
      await seedAttempt(invoice.id, { status: "FAILED", failureReason: null, attemptedAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS) });

      const summary = await getFailureMonitoringSummary(REFERENCE_NOW);
      const anomalyBucket = summary.invoiceEmailFailuresByStatusAndReason.find((b) => b.status === "FAILED" && b.failureReason === null);

      expect(anomalyBucket).toBeDefined();
      expect(anomalyBucket!.count).toBeGreaterThanOrEqual(1);
    });

    it("an attempt entirely outside the 7-day window is excluded", async () => {
      const invoice = await seedPlainInvoice(fixtures);
      const before = await getFailureMonitoringSummary(REFERENCE_NOW);
      const beforeCount = sumAllCounts(before.invoiceEmailFailuresByStatusAndReason);

      await seedAttempt(invoice.id, { status: "FAILED", failureReason: "provider_error", attemptedAt: new Date(REFERENCE_NOW.getTime() - 10 * DAY_MS) });

      const after = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(sumAllCounts(after.invoiceEmailFailuresByStatusAndReason)).toBe(beforeCount);
    });

    it("two attempts sharing the exact same attemptedAt resolve deterministically by id, identically across repeated calls", async () => {
      const invoice = await seedPlainInvoice(fixtures);
      const tiedAt = new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS);
      const lowerId = "00000000-0000-0000-0000-000000000001";
      const higherId = "00000000-0000-0000-0000-000000000002";

      await seedAttempt(invoice.id, { id: lowerId, status: "FAILED", failureReason: "provider_error", attemptedAt: tiedAt });
      await seedAttempt(invoice.id, { id: higherId, status: "UNKNOWN", failureReason: "stale_no_settlement", attemptedAt: tiedAt });

      const first = await getFailureMonitoringSummary(REFERENCE_NOW);
      const second = await getFailureMonitoringSummary(REFERENCE_NOW);

      const firstWinner = first.invoiceEmailFailuresByStatusAndReason.find((b) => b.status === "UNKNOWN" && b.failureReason === "stale_no_settlement");
      const secondWinner = second.invoiceEmailFailuresByStatusAndReason.find((b) => b.status === "UNKNOWN" && b.failureReason === "stale_no_settlement");

      // ORDER BY id DESC — the lexicographically larger id (higherId,
      // UNKNOWN) wins the tie, exactly matching the runbook's own
      // documented convention and this feature's own disposable PGlite
      // validation from PR #113. Determinism is proven by the two
      // independent calls above agreeing on the exact same count.
      expect(firstWinner?.count).toBeGreaterThanOrEqual(1);
      expect(secondWinner?.count).toBe(firstWinner?.count);
    });
  });

  describe("InvoiceEmailAttempt latest-per-invoice stale PENDING (Query D)", () => {
    it("counts a latest PENDING attempt once it is older than the source-derived stale threshold", async () => {
      const { STALE_PENDING_THRESHOLD_MS } = await import("@/lib/invoices/email/send-invoice-email");
      const invoice = await seedPlainInvoice(fixtures);
      const before = await getFailureMonitoringSummary(REFERENCE_NOW);
      const beforeCount = before.invoiceEmailStalePendingCount;

      await seedAttempt(invoice.id, { status: "PENDING", attemptedAt: new Date(REFERENCE_NOW.getTime() - STALE_PENDING_THRESHOLD_MS - 60_000) });

      const after = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(after.invoiceEmailStalePendingCount).toBe(beforeCount + 1);
    });

    it("does not count a latest PENDING attempt younger than the source-derived stale threshold", async () => {
      const invoice = await seedPlainInvoice(fixtures);
      const before = await getFailureMonitoringSummary(REFERENCE_NOW);
      const beforeCount = before.invoiceEmailStalePendingCount;

      await seedAttempt(invoice.id, { status: "PENDING", attemptedAt: new Date(REFERENCE_NOW.getTime() - 30_000) });

      const after = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(after.invoiceEmailStalePendingCount).toBe(beforeCount);
    });

    it("a stale PENDING attempt superseded by a later ACCEPTED attempt is never counted — isolated single-invoice proof", async () => {
      const invoice = await seedPlainInvoice(fixtures);
      const before = await getFailureMonitoringSummary(REFERENCE_NOW);
      const beforeCount = before.invoiceEmailStalePendingCount;

      await seedAttempt(invoice.id, { status: "PENDING", attemptedAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS) });
      const afterPending = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(afterPending.invoiceEmailStalePendingCount).toBe(beforeCount + 1);

      await seedAttempt(invoice.id, { status: "ACCEPTED", attemptedAt: new Date(REFERENCE_NOW.getTime() - 12 * HOUR_MS) });
      const afterAccepted = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(afterAccepted.invoiceEmailStalePendingCount).toBe(beforeCount);
    });
  });

  describe("InvoicePdfArchiveObject reconciliation health (manual review / inconsistent claim state)", () => {
    it("counts a row pending manual review once its cleanupAttemptCount reaches MAX_CLEANUP_ATTEMPTS, in either reconcilable status", async () => {
      const before = await getFailureMonitoringSummary(REFERENCE_NOW);
      const beforeCount = before.pdfArchiveManualReviewPendingCount;

      await seedArchiveObject(fixtures, { status: "PENDING_UPLOAD", cleanupAttemptCount: MAX_CLEANUP_ATTEMPTS });
      const afterFirst = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(afterFirst.pdfArchiveManualReviewPendingCount).toBe(beforeCount + 1);

      await seedArchiveObject(fixtures, { status: "CLEANUP_PENDING", cleanupAttemptCount: MAX_CLEANUP_ATTEMPTS + 5 });
      const afterSecond = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(afterSecond.pdfArchiveManualReviewPendingCount).toBe(beforeCount + 2);
    });

    it("does not count a row below MAX_CLEANUP_ATTEMPTS, and never counts a REFERENCED or CLEANED row regardless of its attempt count", async () => {
      const before = await getFailureMonitoringSummary(REFERENCE_NOW);
      const beforeCount = before.pdfArchiveManualReviewPendingCount;

      await seedArchiveObject(fixtures, { status: "PENDING_UPLOAD", cleanupAttemptCount: MAX_CLEANUP_ATTEMPTS - 1 });
      await seedArchiveObject(fixtures, { status: "REFERENCED", cleanupAttemptCount: MAX_CLEANUP_ATTEMPTS + 100 });
      await seedArchiveObject(fixtures, { status: "CLEANED", cleanupAttemptCount: MAX_CLEANUP_ATTEMPTS + 100 });

      const after = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(after.pdfArchiveManualReviewPendingCount).toBe(beforeCount);
    });

    it("counts inconsistent claim state when exactly one of cleanupLockedAt/cleanupClaimToken is set, in either reconcilable status", async () => {
      const before = await getFailureMonitoringSummary(REFERENCE_NOW);
      const beforeCount = before.pdfArchiveInconsistentClaimStateCount;

      await seedArchiveObject(fixtures, { status: "PENDING_UPLOAD", cleanupLockedAt: REFERENCE_NOW, cleanupClaimToken: null });
      const afterFirst = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(afterFirst.pdfArchiveInconsistentClaimStateCount).toBe(beforeCount + 1);

      await seedArchiveObject(fixtures, { status: "CLEANUP_PENDING", cleanupLockedAt: null, cleanupClaimToken: randomUUID() });
      const afterSecond = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(afterSecond.pdfArchiveInconsistentClaimStateCount).toBe(beforeCount + 2);
    });

    it("does not count a consistent claim state (both set or both null), and never counts a REFERENCED or CLEANED row regardless of its claim fields", async () => {
      const before = await getFailureMonitoringSummary(REFERENCE_NOW);
      const beforeCount = before.pdfArchiveInconsistentClaimStateCount;

      await seedArchiveObject(fixtures, { status: "PENDING_UPLOAD", cleanupLockedAt: null, cleanupClaimToken: null });
      await seedArchiveObject(fixtures, { status: "CLEANUP_PENDING", cleanupLockedAt: REFERENCE_NOW, cleanupClaimToken: randomUUID() });
      await seedArchiveObject(fixtures, { status: "REFERENCED", cleanupLockedAt: REFERENCE_NOW, cleanupClaimToken: null });
      await seedArchiveObject(fixtures, { status: "CLEANED", cleanupLockedAt: null, cleanupClaimToken: randomUUID() });

      const after = await getFailureMonitoringSummary(REFERENCE_NOW);
      expect(after.pdfArchiveInconsistentClaimStateCount).toBe(beforeCount);
    });
  });

  describe("privacy and read-only guarantees", () => {
    it("the summary's own JSON never contains a recipient email, an invoiceId, a webhook organizationId, a PDF archive object id/storagePath, or any other row id", async () => {
      const invoice = await seedPlainInvoice(fixtures);
      await seedAttempt(invoice.id, { status: "FAILED", failureReason: "provider_error", attemptedAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS) });
      await seedWebhookEvent({
        processingStatus: "FAILED",
        failureCode: "unknown_organization",
        organizationId: fixtures.orgA.id,
        createdAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS),
      });
      const archiveObject = await seedArchiveObject(fixtures, { status: "PENDING_UPLOAD", cleanupAttemptCount: MAX_CLEANUP_ATTEMPTS });

      const summary = await getFailureMonitoringSummary(REFERENCE_NOW);
      const serialized = JSON.stringify(summary);

      expect(serialized).not.toContain(MARKERS.recipientEmail);
      expect(serialized).not.toContain(fixtures.orgA.id);
      expect(serialized).not.toContain(invoice.id);
      expect(serialized).not.toContain(archiveObject.id);
      expect(serialized).not.toContain(archiveObject.storagePath);
      expect(serialized).not.toContain(ARCHIVE_OBJECT_STORAGE_PATH_PREFIX);
      for (const id of createdWebhookEventIds) {
        expect(serialized).not.toContain(id);
      }
      for (const id of createdArchiveObjectIds) {
        expect(serialized).not.toContain(id);
      }
    });

    it("calling the summary never mutates a single WebhookEvent, InvoiceEmailAttempt, or InvoicePdfArchiveObject row", async () => {
      const invoice = await seedPlainInvoice(fixtures);
      const attempt = await seedAttempt(invoice.id, { status: "PENDING", attemptedAt: new Date(REFERENCE_NOW.getTime() - 1 * DAY_MS) });
      const event = await seedWebhookEvent({ processingStatus: "PENDING", createdAt: new Date(REFERENCE_NOW.getTime() - 3 * HOUR_MS) });
      const archiveObject = await seedArchiveObject(fixtures, { status: "PENDING_UPLOAD", cleanupAttemptCount: MAX_CLEANUP_ATTEMPTS });

      await getFailureMonitoringSummary(REFERENCE_NOW);

      const attemptAfter = await prisma.invoiceEmailAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      const eventAfter = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
      const archiveObjectAfter = await prisma.invoicePdfArchiveObject.findUniqueOrThrow({ where: { id: archiveObject.id } });

      expect(attemptAfter.status).toBe("PENDING");
      expect(attemptAfter.updatedAt.getTime()).toBe(attempt.updatedAt.getTime());
      expect(eventAfter.processingStatus).toBe("PENDING");
      expect(eventAfter.updatedAt.getTime()).toBe(event.updatedAt.getTime());
      expect(archiveObjectAfter.status).toBe("PENDING_UPLOAD");
      expect(archiveObjectAfter.cleanupAttemptCount).toBe(MAX_CLEANUP_ATTEMPTS);
      expect(archiveObjectAfter.updatedAt.getTime()).toBe(archiveObject.updatedAt.getTime());
    });
  });
});

function sumAllCounts(buckets: { count: number }[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}
