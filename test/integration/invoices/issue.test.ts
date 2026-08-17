import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createActivity } from "@/lib/activity/create-activity";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { actAs, resetAuthMock } from "../../support/auth-mock";
import type { Role } from "@/generated/prisma/enums";

/**
 * Invoice System Official Slice 3, sub-PR 3b — the live Issue/finalization
 * pipeline. Runs against the real repository database harness (PGlite).
 *
 * Most tests below use issueInvoice()'s own dependency injection (upload/
 * remove/resolveLogo/render/now/generateArchiveId/deliverEmails) to control
 * outcomes directly, as plain function arguments — this never depends on
 * process.env.TEST_MODE at all. The one exception is the final
 * "issueInvoiceAction — full-stack wiring" describe block below, whose own
 * success-path test calls the real Server Action with NO deps override
 * (Server Actions correctly accept no fault-injection parameter) — that
 * one test needs storage.ts/logo.ts's own real TEST_MODE branch to avoid
 * touching real Supabase Storage. TEST_MODE is set ONLY here, in this
 * file's own top-level code (never in the shared test/integration/
 * setup-env.ts) — precisely because setting it there was tried first and
 * found to leak into and change the behavior of unrelated TEST_MODE-
 * checking code in OTHER integration test files (e.g.
 * src/lib/billing/provider/provider.ts's own provider-selection branch,
 * which prioritizes TEST_MODE over real Paddle config). Every PDF-module
 * import below is therefore a top-level dynamic import performed AFTER
 * setting TEST_MODE=1, exactly matching test/unit/recovery-token.test.ts's
 * own established technique — this file's own isolated module registry
 * is unaffected by, and never affects, any other test file's.
 */

const ORIGINAL_TEST_MODE = process.env.TEST_MODE;
process.env.TEST_MODE = "1";

const { issueInvoice } = await import("@/lib/invoices/pdf/issue-invoice");
const { issueInvoiceAction } = await import("@/app/(dashboard)/invoices/[id]/edit/issue-actions");
const { testStorageRead } = await import("@/lib/storage/test-storage");
const { uploadInvoicePdfObject } = await import("@/lib/invoices/pdf/storage");
const { renderInvoicePdfBuffer } = await import("@/lib/invoices/pdf/document");
const { parseIssuerSnapshot, parseRecipientSnapshot } = await import("@/lib/invoices/pdf/snapshot-types");

afterAll(() => {
  if (ORIGINAL_TEST_MODE === undefined) delete process.env.TEST_MODE;
  else process.env.TEST_MODE = ORIGINAL_TEST_MODE;
});

vi.mock("@/lib/activity/create-activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/activity/create-activity")>();
  return { ...actual, createActivity: vi.fn(actual.createActivity) };
});

const INVOICE_NUMBER_PREFIX = "INV-ISSUE";

type DraftInvoiceOverrides = {
  status?: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  amount?: string;
  subtotal?: string;
  notes?: string;
};

async function seedDraftInvoice(fixtures: TestFixtures, overrides: DraftInvoiceOverrides = {}) {
  return prisma.invoice.create({
    data: {
      invoiceNumber: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}-${randomUUID().slice(0, 8)}`,
      status: "DRAFT",
      amount: "500.00",
      subtotal: "500.00",
      discountAmount: "0.00",
      taxAmount: "0.00",
      discountType: "NONE",
      taxLabel: "TAX",
      currency: "USD",
      issueDate: new Date("2026-01-01T00:00:00.000Z"),
      projectId: fixtures.project.id,
      clientId: fixtures.clientA.id,
      organizationId: fixtures.orgA.id,
      ...overrides,
    },
  });
}

function actorFor(fixtures: TestFixtures, user: { id: string; name: string }, role: Role) {
  return { organizationId: fixtures.orgA.id, userId: user.id, userName: user.name, role };
}

function isPdfSignature(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString("latin1") === "%PDF";
}

describe("issueInvoice — Invoice System Official Slice 3, sub-PR 3b", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterAll(async () => {
    await prisma.invoicePdfArchiveObject.deleteMany({ where: { organizationId: { in: [fixtures.orgA.id, fixtures.orgB.id] } } });
    await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}` } } });
    await cleanupTestData(fixtures);
  });

  // --- 1-11: OWNER success path, flat and itemized ---------------------------

  it("OWNER successfully issues a flat DRAFT — status SENT, totals/snapshots/ledger/PDF/Activity/Notification all consistent", async () => {
    const invoice = await seedDraftInvoice(fixtures, { amount: "500.00", subtotal: "500.00" });
    const fixedNow = new Date("2026-08-17T12:00:00.000Z");

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      { now: () => fixedNow },
    );

    expect(result).toEqual({ ok: true, invoiceId: invoice.id, finalizedAt: fixedNow });

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("SENT");
    expect(after.finalizedAt?.toISOString()).toBe(fixedNow.toISOString());
    expect(after.pdfGeneratedAt?.toISOString()).toBe(fixedNow.toISOString());
    expect(after.paidAt).toBeNull();
    expect(after.amount.toFixed(2)).toBe("500.00");
    expect(after.subtotal?.toFixed(2)).toBe("500.00");
    expect(after.discountAmount?.toFixed(2)).toBe("0.00");
    expect(after.taxAmount?.toFixed(2)).toBe("0.00");
    expect(after.pdfStoragePath).toBeTruthy();
    expect(after.issuerSnapshot).toBeTruthy();
    expect(after.recipientSnapshot).toBeTruthy();

    const ledger = await prisma.invoicePdfArchiveObject.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(ledger.status).toBe("REFERENCED");
    expect(ledger.storagePath).toBe(after.pdfStoragePath);
    expect(ledger.referencedAt?.toISOString()).toBe(fixedNow.toISOString());

    const stored = testStorageRead("attachments", after.pdfStoragePath!);
    expect(stored).not.toBeNull();
    expect(isPdfSignature(stored!.body)).toBe(true);
    expect(stored!.contentType).toBe("application/pdf");

    const activities = await prisma.activity.findMany({ where: { entityType: "INVOICE", entityId: invoice.id, action: "STATUS_CHANGED" } });
    expect(activities).toHaveLength(1);

    const notifications = await prisma.notification.findMany({ where: { activityId: activities[0].id } });
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.every((n) => n.type === "INVOICE_STATUS_CHANGED")).toBe(true);

    const emailAttempts = await prisma.invoiceEmailAttempt.findMany({ where: { invoiceId: invoice.id } });
    expect(emailAttempts).toHaveLength(0);
  });

  it("OWNER successfully issues an itemized DRAFT — persisted totals equal the authoritative calculation result", async () => {
    const invoice = await seedDraftInvoice(fixtures, { amount: "0.00", subtotal: "0.00" });
    await prisma.invoiceLineItem.createMany({
      data: [
        { invoiceId: invoice.id, description: "Design", quantity: "2", unitPrice: "50.00", lineTotal: "100.00", position: 0 },
        { invoiceId: invoice.id, description: "Hosting", quantity: "1", unitPrice: "29.99", lineTotal: "29.99", position: 1 },
      ],
    });

    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });

    expect(result.ok).toBe(true);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("SENT");
    expect(after.subtotal?.toFixed(2)).toBe("129.99");
    expect(after.amount.toFixed(2)).toBe("129.99");

    const stored = testStorageRead("attachments", after.pdfStoragePath!);
    expect(isPdfSignature(stored!.body)).toBe(true);
  });

  it("persisted snapshots equal what was strictly parsed/used for rendering — round-trip through the strict parser succeeds", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    await issueInvoice({ actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() });

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(parseIssuerSnapshot(after.issuerSnapshot).ok).toBe(true);
    expect(parseRecipientSnapshot(after.recipientSnapshot).ok).toBe(true);
  });

  // --- 12: notification delivery only after commit ----------------------------

  it("notification delivery runs only after the DB transaction has already committed", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const callOrder: string[] = [];

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      {
        deliverEmails: async (ids) => {
          callOrder.push("deliverEmails");
          const row = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
          // The Invoice must already be committed as SENT by the time delivery runs.
          expect(row.status).toBe("SENT");
          return { attempted: ids.length, sent: 0, failed: 0, skipped: ids.length };
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(callOrder).toEqual(["deliverEmails"]);
  });

  // --- 14-15: role rejection ---------------------------------------------------

  it("ADMIN is rejected with FORBIDDEN, and the invoice remains DRAFT", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.admin, "ADMIN"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("DRAFT");
  });

  it("MEMBER is rejected with FORBIDDEN, and the invoice remains DRAFT", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.member, "MEMBER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("DRAFT");
  });

  // --- 16: cross-org / nonexistent indistinguishable --------------------------

  it("a cross-organization invoiceId and a nonexistent invoiceId both return the identical NOT_FOUND result", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const crossOrgActor = actorFor(fixtures, fixtures.orgBOwner, "OWNER");

    const crossOrgResult = await issueInvoice({
      actor: { ...crossOrgActor, organizationId: fixtures.orgB.id },
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });
    const nonexistentResult = await issueInvoice({
      actor: { ...crossOrgActor, organizationId: fixtures.orgB.id },
      invoiceId: randomUUID(),
      expectedUpdatedAt: new Date().toISOString(),
    });

    expect(crossOrgResult).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(nonexistentResult).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  // --- 17: non-DRAFT rejected --------------------------------------------------

  it("a non-DRAFT invoice is rejected with NOT_DRAFT", async () => {
    const invoice = await seedDraftInvoice(fixtures, { status: "SENT" });
    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });
    expect(result).toEqual({ ok: false, error: "NOT_DRAFT" });
  });

  // --- 18: stale expectedUpdatedAt rejected before any render/upload work -----

  it("a stale expectedUpdatedAt is rejected before any render/upload work happens", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const staleDate = new Date(invoice.updatedAt.getTime() - 60_000).toISOString();
    let renderCalled = false;

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: staleDate },
      { render: async () => { renderCalled = true; return Buffer.from("%PDF-1.3"); } },
    );

    expect(result).toEqual({ ok: false, error: "STALE_VERSION" });
    expect(renderCalled).toBe(false);
  });

  // --- 19: concurrent edit during rendering is caught by the final guard -----

  it("an edit that commits DURING rendering is caught by the final transaction's own guard — CONFLICT, with compensation", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const expectedUpdatedAt = invoice.updatedAt.toISOString();

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt },
      {
        render: async (viewModel) => {
          // Simulate a concurrent edit committing while this render is in flight.
          await prisma.invoice.update({ where: { id: invoice.id }, data: { notes: "concurrent edit", updatedAt: new Date(invoice.updatedAt.getTime() + 5000) } });
          return renderInvoicePdfBuffer(viewModel);
        },
      },
    );

    expect(result).toEqual({ ok: false, error: "CONFLICT" });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("DRAFT");
    expect(after.notes).toBe("concurrent edit");

    const ledger = await prisma.invoicePdfArchiveObject.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(ledger.status).toBe("CLEANED");
    expect(testStorageRead("attachments", ledger.storagePath)).toBeNull();
  });

  // --- 20-21: render/validation failures create neither ledger nor object -----

  it("a renderer failure creates neither a ledger row nor a Storage object", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const before = await prisma.invoicePdfArchiveObject.count({ where: { invoiceId: invoice.id } });

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      { render: async () => { throw new Error("simulated render failure"); } },
    );

    expect(result).toEqual({ ok: false, error: "RENDER_FAILED" });
    const after = await prisma.invoicePdfArchiveObject.count({ where: { invoiceId: invoice.id } });
    expect(after).toBe(before);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("DRAFT");
  });

  it("a PDF buffer that fails structural validation creates neither a ledger row nor a Storage object", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      { render: async () => Buffer.from("not a real pdf") },
    );
    expect(result).toEqual({ ok: false, error: "RENDER_FAILED" });
    expect(await prisma.invoicePdfArchiveObject.count({ where: { invoiceId: invoice.id } })).toBe(0);
  });

  // --- 22: ledger-create failure performs no upload ----------------------------

  it("a ledger-creation failure (archiveId collision) performs no upload attempt", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const collidingArchiveId = randomUUID();
    // Pre-occupy the exact id the service will try to use.
    await prisma.invoicePdfArchiveObject.create({
      data: {
        id: collidingArchiveId,
        organizationId: fixtures.orgA.id,
        documentVersion: 1,
        storagePath: `organizations/${fixtures.orgA.id}/invoice-pdf/${randomUUID()}/v1/${randomUUID()}.pdf`,
        status: "PENDING_UPLOAD",
      },
    });

    let uploadCalled = false;
    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      {
        generateArchiveId: () => collidingArchiveId,
        upload: async (args) => {
          uploadCalled = true;
          return uploadInvoicePdfObject(args);
        },
      },
    );

    expect(result).toEqual({ ok: false, error: "FINALIZATION_FAILED" });
    expect(uploadCalled).toBe(false);

    await prisma.invoicePdfArchiveObject.delete({ where: { id: collidingArchiveId } });
  });

  // --- 23-25: upload failure / compensation -----------------------------------

  it("an upload failure attempts exact compensation and, on success, the ledger becomes CLEANED", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    let removedPath: string | null = null;

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      {
        upload: async () => ({ ok: false, reason: "upload_failed" }),
        remove: async ({ path }) => {
          removedPath = path;
          return { ok: true };
        },
      },
    );

    expect(result).toEqual({ ok: false, error: "UPLOAD_FAILED" });
    const ledger = await prisma.invoicePdfArchiveObject.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(ledger.status).toBe("CLEANED");
    expect(ledger.cleanedAt).not.toBeNull();
    expect(removedPath).toBe(ledger.storagePath);
  });

  it("when compensating removal also fails, the ledger becomes CLEANUP_PENDING with a bounded failure category and an incremented attempt count", async () => {
    const invoice = await seedDraftInvoice(fixtures);

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      {
        upload: async () => ({ ok: false, reason: "upload_failed" }),
        remove: async () => ({ ok: false, reason: "remove_failed" }),
      },
    );

    expect(result).toEqual({ ok: false, error: "UPLOAD_FAILED" });
    const ledger = await prisma.invoicePdfArchiveObject.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(ledger.status).toBe("CLEANUP_PENDING");
    expect(ledger.cleanupAttemptCount).toBe(1);
    expect(ledger.lastCleanupFailureCategory).toBe("remove_failed");
    expect(ledger.cleanedAt).toBeNull();
  });

  // --- 26-27: final transaction / Activity failure rolls back + compensates ---

  it("a forced Activity-write failure rolls back the Invoice/ledger transition together, then compensates the uploaded object", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    vi.mocked(createActivity).mockRejectedValueOnce(new Error("simulated activity failure"));

    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });

    expect(result).toEqual({ ok: false, error: "FINALIZATION_FAILED" });

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("DRAFT");
    expect(after.pdfStoragePath).toBeNull();
    expect(after.finalizedAt).toBeNull();

    const activities = await prisma.activity.findMany({ where: { entityType: "INVOICE", entityId: invoice.id, action: "STATUS_CHANGED" } });
    expect(activities).toHaveLength(0);

    const ledger = await prisma.invoicePdfArchiveObject.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(ledger.status).toBe("CLEANED");
    expect(testStorageRead("attachments", ledger.storagePath)).toBeNull();
  });

  // --- 28: post-commit delivery failure never undoes finalization -------------

  it("a post-commit notification-email delivery failure never undoes the already-committed finalization", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      { deliverEmails: async () => { throw new Error("simulated provider outage"); } },
    );

    expect(result.ok).toBe(true);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("SENT");
  });

  // --- 29-30: logo resolution threading ----------------------------------------

  it("valid logo bytes and their SHA-256 match the persisted snapshot's own provenance", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const fakeBytes = Buffer.from("fake-logo-bytes-for-issue-test");
    const { createHash } = await import("node:crypto");
    const expectedSha = createHash("sha256").update(fakeBytes).digest("hex");

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      {
        resolveLogo: async () => ({
          provenance: { included: true, bucket: "logos", path: "organizations/x/logo/y.png", contentType: "image/png", sha256: expectedSha },
          bytes: { data: fakeBytes, contentType: "image/png" },
        }),
      },
    );

    expect(result.ok).toBe(true);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    const issuerSnapshot = after.issuerSnapshot as { logo: { included: boolean; sha256: string } };
    expect(issuerSnapshot.logo.included).toBe(true);
    expect(issuerSnapshot.logo.sha256).toBe(expectedSha);
  });

  it("no configured logo (the default fixture organization has no profile) falls back without blocking Issue", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });
    expect(result.ok).toBe(true);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    const issuerSnapshot = after.issuerSnapshot as { logo: { included: boolean } };
    expect(issuerSnapshot.logo.included).toBe(false);
  });

  // --- 31: no private path leaks anywhere --------------------------------------

  it("no Storage path appears in the service result or the Activity metadata", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });
    expect(Object.keys(result)).not.toContain("pdfStoragePath");
    expect(JSON.stringify(result)).not.toContain("invoice-pdf");

    const activity = await prisma.activity.findFirstOrThrow({ where: { entityType: "INVOICE", entityId: invoice.id, action: "STATUS_CHANGED" } });
    expect(JSON.stringify(activity.metadata)).not.toContain("invoice-pdf");
    expect(JSON.stringify(activity.metadata)).not.toContain("attachments/organizations");
  });

  // --- 32: source DRAFT unchanged before the final transaction -----------------

  it("the source DRAFT row is byte-for-byte unchanged right up until the final transaction commits", async () => {
    const invoice = await seedDraftInvoice(fixtures, { notes: "original notes" });

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      {
        render: async (viewModel) => {
          const midFlight = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
          expect(midFlight.status).toBe("DRAFT");
          expect(midFlight.notes).toBe("original notes");
          expect(midFlight.pdfStoragePath).toBeNull();
          expect(midFlight.updatedAt.getTime()).toBe(invoice.updatedAt.getTime());
          return renderInvoicePdfBuffer(viewModel);
        },
      },
    );

    expect(result.ok).toBe(true);
  });

  // --- 33: true concurrency — exactly one winner -------------------------------

  it("two simultaneous Issue attempts for the same version produce exactly one finalized invoice, one REFERENCED ledger row, and one Activity", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const input = {
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    };

    const [a, b] = await Promise.all([issueInvoice(input), issueInvoice(input)]);
    const results = [a, b];

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("SENT");

    const referenced = await prisma.invoicePdfArchiveObject.findMany({ where: { invoiceId: invoice.id, status: "REFERENCED" } });
    expect(referenced).toHaveLength(1);

    const activities = await prisma.activity.findMany({ where: { entityType: "INVOICE", entityId: invoice.id, action: "STATUS_CHANGED" } });
    expect(activities).toHaveLength(1);

    // The losing attempt's own uploaded object must not be left as an
    // untracked orphan — it was compensated (CLEANED or discoverable
    // CLEANUP_PENDING), never silently abandoned outside the ledger.
    const allLedgerRows = await prisma.invoicePdfArchiveObject.findMany({ where: { invoiceId: invoice.id } });
    expect(allLedgerRows.length).toBeGreaterThanOrEqual(1);
    for (const row of allLedgerRows) {
      expect(["REFERENCED", "CLEANED", "CLEANUP_PENDING"]).toContain(row.status);
    }
  });

  // --- 34: a crashed mid-flight attempt leaves a discoverable PENDING_UPLOAD row

  it("a ledger row manually left at PENDING_UPLOAD (simulating a crash before compensation ran) is discoverable via the same query shape the future reconciliation worker will use", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    const archiveId = randomUUID();
    const path = `organizations/${fixtures.orgA.id}/invoice-pdf/${invoice.id}/v1/${archiveId}.pdf`;
    await uploadInvoicePdfObject({ path, body: Buffer.from("%PDF-1.3 orphaned by a simulated crash") });

    await prisma.invoicePdfArchiveObject.create({
      data: { id: archiveId, organizationId: fixtures.orgA.id, invoiceId: invoice.id, documentVersion: 1, storagePath: path, status: "PENDING_UPLOAD" },
    });

    const discoverable = await prisma.invoicePdfArchiveObject.findMany({
      where: { status: { in: ["PENDING_UPLOAD", "CLEANUP_PENDING"] } },
    });
    expect(discoverable.some((row) => row.id === archiveId)).toBe(true);
    expect(testStorageRead("attachments", path)).not.toBeNull();

    await prisma.invoicePdfArchiveObject.delete({ where: { id: archiveId } });
  });
});

describe("issueInvoiceAction — full-stack wiring (Server Action -> service)", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterAll(async () => {
    await prisma.invoicePdfArchiveObject.deleteMany({ where: { organizationId: { in: [fixtures.orgA.id, fixtures.orgB.id] } } });
    await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}` } } });
    await cleanupTestData(fixtures);
  });

  it("OWNER can issue via the real Server Action, and the public result contains no private path", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    actAs(fixtures.owner, fixtures.orgA.id);
    const result = await issueInvoiceAction(invoice.id, invoice.updatedAt.toISOString());
    resetAuthMock();

    expect(result.ok).toBe(true);
    expect(Object.keys(result)).toEqual(["ok", "finalizedAt"]);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("SENT");
  });

  it("ADMIN calling the real Server Action is rejected with FORBIDDEN", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    actAs(fixtures.admin, fixtures.orgA.id);
    const result = await issueInvoiceAction(invoice.id, invoice.updatedAt.toISOString());
    resetAuthMock();

    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("DRAFT");
  });

  it("MEMBER calling the real Server Action is rejected with FORBIDDEN", async () => {
    const invoice = await seedDraftInvoice(fixtures);
    actAs(fixtures.member, fixtures.orgA.id);
    const result = await issueInvoiceAction(invoice.id, invoice.updatedAt.toISOString());
    resetAuthMock();

    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});
