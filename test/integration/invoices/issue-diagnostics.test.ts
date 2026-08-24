import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createActivity } from "@/lib/activity/create-activity";
import { checkRateLimit } from "@/lib/rate-limit";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { actAs, setMockAuthUser, resetAuthMock } from "../../support/auth-mock";
import type { Role } from "@/generated/prisma/enums";

/**
 * Production Observability Correction 1 — bounded diagnostics for the
 * Invoice Issue/PDF pipeline (src/lib/invoices/pdf/issue-diagnostics.ts,
 * wired into src/lib/invoices/pdf/issue-invoice.ts and both PDF download
 * routes). Runs against the real repository database harness (PGlite),
 * mirroring test/integration/invoices/issue.test.ts's and
 * issue-reconciliation-coordination.test.ts's own TEST_MODE conventions
 * and deps-injection/real-invalid-data failure-triggering techniques
 * exactly — no novel mocking approach is introduced here. This file adds
 * diagnostic assertions on top of already-proven failure paths; it does
 * not re-prove the underlying Issue/PDF behavior those two files already
 * cover in full.
 */

const ORIGINAL_TEST_MODE = process.env.TEST_MODE;
process.env.TEST_MODE = "1";

const { issueInvoice } = await import("@/lib/invoices/pdf/issue-invoice");
const { GET: staffPdfGet } = await import("@/app/api/invoices/[id]/pdf/route");
const { GET: portalPdfGet } = await import("@/app/api/portal/invoices/[id]/pdf/route");
const { buildInvoicePdfStoragePath, createInvoicePdfSignedUrl } = await import("@/lib/invoices/pdf/storage");

afterAll(() => {
  if (ORIGINAL_TEST_MODE === undefined) delete process.env.TEST_MODE;
  else process.env.TEST_MODE = ORIGINAL_TEST_MODE;
});

vi.mock("@/lib/activity/create-activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/activity/create-activity")>();
  return { ...actual, createActivity: vi.fn(actual.createActivity) };
});

vi.mock("@/lib/invoices/pdf/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/invoices/pdf/storage")>();
  return { ...actual, createInvoicePdfSignedUrl: vi.fn() };
});

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn() };
});

const mockedSign = vi.mocked(createInvoicePdfSignedUrl);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const DEFAULT_SIGNED_URL = "https://example.test/signed-invoice.pdf";

const EVENT_MESSAGE = "[invoice-issue] Issue pipeline failure.";
const MISMATCH_EVENT_MESSAGE = "[invoice-pdf] Canonical path/ledger mismatch.";

const INVOICE_NUMBER_PREFIX = "INV-ISSUE-DIAG";

// Deliberately identifiable marker values planted in every corner a raw
// error/thrown value could theoretically leak from — the same technique
// test/unit/portal-analytics-failure-classification.test.ts already
// established for F5.
const MARKERS = {
  message: "MARKER_MESSAGE_7ad1",
  stack: "MARKER_STACK_44bc",
  cause: "MARKER_CAUSE_9e02",
  digest: "MARKER_DIGEST_3f81",
  constraint: "MARKER_CONSTRAINT_InvoicePdfArchiveObject_fkey_66aa",
  id: "11111111-2222-3333-4444-555555555555",
  email: "marker-user@example-marker-domain.test",
  url: "https://marker-storage.example.test/marker-bucket/marker-object",
};

function markerError(): Error {
  const err = Object.assign(new Error(MARKERS.message), {
    digest: MARKERS.digest,
    cause: MARKERS.cause,
    meta: { modelName: "InvoicePdfArchiveObject", driverAdapterError: { cause: { constraint: { index: MARKERS.constraint } } } },
    invoiceId: MARKERS.id,
    organizationId: MARKERS.id,
    email: MARKERS.email,
    storagePath: MARKERS.url,
  });
  err.stack = MARKERS.stack;
  return err;
}

function assertNoMarkers(consoleErrorSpy: ReturnType<typeof vi.spyOn>) {
  const serialized = JSON.stringify(consoleErrorSpy.mock.calls);
  for (const marker of Object.values(MARKERS)) {
    expect(serialized).not.toContain(marker);
  }
}

async function seedDraftInvoice(fixtures: TestFixtures) {
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
    },
  });
}

function actorFor(fixtures: TestFixtures, user: { id: string; name: string }, role: Role) {
  return { organizationId: fixtures.orgA.id, userId: user.id, userName: user.name, role };
}

describe("issueInvoice diagnostics — bounded, allowlisted-only stage logging", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterAll(async () => {
    await prisma.invoicePdfArchiveObject.deleteMany({ where: { organizationId: { in: [fixtures.orgA.id, fixtures.orgB.id] } } });
    await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}` } } });
    await cleanupTestData(fixtures);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a successful Issue emits no diagnostic at all", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);

    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });

    expect(result.ok).toBe(true);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("an ordinary NOT_FOUND/NOT_DRAFT/STALE_VERSION/FORBIDDEN outcome emits no diagnostic — these are expected outcomes, not failures", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);

    const notFound = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: randomUUID(),
      expectedUpdatedAt: new Date().toISOString(),
    });
    expect(notFound).toEqual({ ok: false, error: "NOT_FOUND" });

    const stale = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: new Date("2000-01-01T00:00:00.000Z").toISOString(),
    });
    expect(stale).toEqual({ ok: false, error: "STALE_VERSION" });

    const forbidden = await issueInvoice({
      actor: actorFor(fixtures, fixtures.member, "MEMBER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });
    expect(forbidden).toEqual({ ok: false, error: "FORBIDDEN" });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("snapshot_invalid: a real, deliberately invalid line item (zero quantity) makes calculateInvoiceTotals reject it, logged exactly once, and the returned SNAPSHOT_INVALID code is unchanged", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);
    // A genuinely invalid persisted line item — real data, not a mock —
    // the same "real invalid data over fabricated mocks" philosophy this
    // suite already establishes elsewhere (e.g. F1's own real P2003
    // reproduction).
    await prisma.invoiceLineItem.create({
      data: { invoiceId: invoice.id, description: "Bad row", quantity: "0", unitPrice: "10.00", lineTotal: "0.00", position: 0 },
    });

    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });

    expect(result).toEqual({ ok: false, error: "SNAPSHOT_INVALID" });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "snapshot_invalid" });
    expect(Object.keys(consoleErrorSpy.mock.calls[0][1] as object)).toEqual(["stage"]);
  });

  it("render_failed: both render attempts failing (logo included) logs render_failed exactly once, not twice — no duplicate diagnostic", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);
    let renderCalls = 0;
    const { createHash } = await import("node:crypto");
    const corruptBytes = Buffer.from("corrupt bytes");
    const correctSha = createHash("sha256").update(corruptBytes).digest("hex");

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      {
        // The provenance's own sha256 must genuinely match the bytes —
        // this test is about the renderer itself failing, never about
        // the unrelated provenance/byte-mismatch guard (matches
        // issue.test.ts's own established fixture for this exact
        // scenario).
        resolveLogo: async () => ({
          provenance: { included: true, bucket: "logos", path: "organizations/x/logo/y.png", contentType: "image/png", sha256: correctSha },
          bytes: { data: corruptBytes, contentType: "image/png" },
        }),
        render: async () => {
          renderCalls += 1;
          throw new Error("simulated render failure on both attempts");
        },
      },
    );

    expect(result).toEqual({ ok: false, error: "RENDER_FAILED" });
    expect(renderCalls).toBe(2);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "render_failed" });
  });

  it("render_failed: a render failure with no logo involved (single attempt) logs render_failed exactly once", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      { render: async () => { throw new Error("simulated render failure"); } },
    );

    expect(result).toEqual({ ok: false, error: "RENDER_FAILED" });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "render_failed" });
  });

  it("pdf_too_large: an oversized (but structurally valid) rendered buffer logs pdf_too_large exactly once, distinct from render_failed", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);
    const { MAX_PDF_BYTES } = await import("@/lib/invoices/pdf/buffer-validation");
    const oversized = Buffer.concat([Buffer.from("%PDF-1.3"), Buffer.alloc(MAX_PDF_BYTES)]);

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      { render: async () => oversized },
    );

    expect(result).toEqual({ ok: false, error: "PDF_TOO_LARGE" });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "pdf_too_large" });
  });

  it("identity_build_failed: an invalid generated archive identity logs identity_build_failed exactly once, distinct from other FINALIZATION_FAILED stages", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      { generateArchiveId: () => "not-a-valid-uuid" },
    );

    expect(result).toEqual({ ok: false, error: "FINALIZATION_FAILED" });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "identity_build_failed" });
  });

  it("ledger_create_failed: a rejected ledger-row create logs ledger_create_failed exactly once, with full non-disclosure of the real (marker-laden) thrown error", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);
    const createSpy = vi.spyOn(prisma.invoicePdfArchiveObject, "create").mockRejectedValueOnce(markerError());

    try {
      const result = await issueInvoice({
        actor: actorFor(fixtures, fixtures.owner, "OWNER"),
        invoiceId: invoice.id,
        expectedUpdatedAt: invoice.updatedAt.toISOString(),
      });

      expect(result).toEqual({ ok: false, error: "FINALIZATION_FAILED" });
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "ledger_create_failed" });
      expect(Object.keys(consoleErrorSpy.mock.calls[0][1] as object)).toEqual(["stage"]);
      assertNoMarkers(consoleErrorSpy);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("ledger_ownership_check_failed: a rejected ownership recheck logs ledger_ownership_check_failed exactly once, with full non-disclosure of the real (marker-laden) thrown error", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);
    const uploadSpy = vi.fn(async () => ({ ok: true as const }));
    const findFirstSpy = vi.spyOn(prisma.invoicePdfArchiveObject, "findFirst").mockRejectedValueOnce(markerError());

    try {
      const result = await issueInvoice(
        { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
        { render: async () => Buffer.from("%PDF-1.3"), upload: uploadSpy },
      );

      expect(result).toEqual({ ok: false, error: "FINALIZATION_FAILED" });
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "ledger_ownership_check_failed" });
      assertNoMarkers(consoleErrorSpy);
    } finally {
      findFirstSpy.mockRestore();
    }
  });

  it("ledger_ownership_lost: the ownership recheck resolving null logs ledger_ownership_lost exactly once, distinct from the query-rejection stage above", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);
    const uploadSpy = vi.fn(async () => ({ ok: true as const }));
    const findFirstSpy = vi.spyOn(prisma.invoicePdfArchiveObject, "findFirst").mockResolvedValueOnce(null);

    try {
      const result = await issueInvoice(
        { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
        { render: async () => Buffer.from("%PDF-1.3"), upload: uploadSpy },
      );

      expect(result).toEqual({ ok: false, error: "FINALIZATION_FAILED" });
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "ledger_ownership_lost" });
    } finally {
      findFirstSpy.mockRestore();
    }
  });

  it("upload_failed: an unsuccessful upload logs upload_failed exactly once", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      { upload: async () => ({ ok: false, reason: "upload_failed" }) },
    );

    expect(result).toEqual({ ok: false, error: "UPLOAD_FAILED" });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "upload_failed" });
  });

  it("storage_not_configured: an upload adapter reporting storage_not_configured logs the distinct storage_not_configured stage, never upload_failed", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      { upload: async () => ({ ok: false, reason: "storage_not_configured" }) },
    );

    expect(result).toEqual({ ok: false, error: "STORAGE_NOT_CONFIGURED" });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "storage_not_configured" });
  });

  it("transaction_failed: a ledger-transition invariant failure logs transaction_failed exactly once", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);

    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt.toISOString() },
      {
        afterUploadBeforeFinalize: async () => {
          await prisma.invoicePdfArchiveObject.updateMany({
            where: { invoiceId: invoice.id, status: "PENDING_UPLOAD" },
            data: { status: "CLEANED", cleanedAt: new Date() },
          });
        },
      },
    );

    expect(result).toEqual({ ok: false, error: "FINALIZATION_FAILED" });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "transaction_failed" });
  });

  it("transaction_failed: a forced Activity-write failure (real, marker-laden thrown error) logs transaction_failed exactly once, with full non-disclosure", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);
    vi.mocked(createActivity).mockRejectedValueOnce(markerError());

    const result = await issueInvoice({
      actor: actorFor(fixtures, fixtures.owner, "OWNER"),
      invoiceId: invoice.id,
      expectedUpdatedAt: invoice.updatedAt.toISOString(),
    });

    expect(result).toEqual({ ok: false, error: "FINALIZATION_FAILED" });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(EVENT_MESSAGE, { stage: "transaction_failed" });
    assertNoMarkers(consoleErrorSpy);
  });

  it("CONFLICT (an ordinary optimistic-concurrency race) never logs — a concurrent edit committing after the early read but before the final transaction", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedDraftInvoice(fixtures);
    const expectedUpdatedAt = invoice.updatedAt.toISOString();

    // Matches issue.test.ts's own established CONFLICT fixture exactly:
    // the early read/version check already passed, then a concurrent
    // edit commits during the render/upload window, so only the final
    // transaction's own guarded updateMany catches it — a genuine,
    // ordinary race, never a system failure.
    const result = await issueInvoice(
      { actor: actorFor(fixtures, fixtures.owner, "OWNER"), invoiceId: invoice.id, expectedUpdatedAt },
      {
        afterUploadBeforeFinalize: async () => {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { notes: "concurrent edit via afterUploadBeforeFinalize", updatedAt: new Date(invoice.updatedAt.getTime() + 5000) },
          });
        },
      },
    );
    expect(result).toEqual({ ok: false, error: "CONFLICT" });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe("Invoice PDF route diagnostics — canonical path/ledger mismatch, staff and Portal", () => {
  let fixtures: TestFixtures;

  const VALID_ISSUER_SNAPSHOT = {
    schemaVersion: 1,
    legalName: "Test Org A",
    address: { streetAddress: null, city: null, state: null, postalCode: null },
    country: null,
    taxId: null,
    supportEmail: null,
    phone: null,
    website: null,
    brandColor: null,
    payment: null,
    logo: { included: false, reason: "no_logo_configured" },
  };
  const VALID_RECIPIENT_SNAPSHOT = {
    schemaVersion: 1,
    billingName: "Test Client A",
    email: null,
    address: { streetAddress: null, city: null, state: null, postalCode: null },
    country: null,
    taxId: null,
  };
  const FIXED_NOW = new Date("2026-08-24T12:00:00.000Z");

  type MismatchMode = "identityMismatch" | "malformedVersion";

  async function seedMismatchedArchivedInvoice(mode: MismatchMode) {
    const invoiceId = randomUUID();
    const archiveId = randomUUID();
    // For "malformedVersion", the Invoice's own persisted documentVersion
    // must equal the ledger row's own (also malformed) documentVersion —
    // the six-predicate ledger query requires an exact match, so both
    // sides must carry the same invalid value for the row to be fetched
    // at all before the canonical-path rebuild ever runs and throws.
    const documentVersion = mode === "malformedVersion" ? 0 : 1;
    // buildInvoicePdfStoragePath itself would throw on documentVersion 0
    // — the persisted pdfStoragePath is built directly (bypassing that
    // validation) so a real, structurally malformed-but-persisted path
    // exists to seed, exactly mirroring how a real malformed row could
    // exist in production (from data written before a future validation
    // tightening, for instance) without this fixture itself needing to
    // reproduce impossible application behavior.
    const path =
      mode === "malformedVersion"
        ? `organizations/${fixtures.orgA.id}/invoice-pdf/${invoiceId}/v0/${archiveId}.pdf`
        : buildInvoicePdfStoragePath({ organizationId: fixtures.orgA.id, invoiceId, documentVersion, archiveId });

    const invoice = await prisma.invoice.create({
      data: {
        id: invoiceId,
        invoiceNumber: `${INVOICE_NUMBER_PREFIX}-RT-${fixtures.runId}-${invoiceId.slice(0, 8)}`,
        status: "SENT",
        amount: "100.00",
        subtotal: "100.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        finalizedAt: FIXED_NOW,
        pdfGeneratedAt: FIXED_NOW,
        issuerSnapshot: VALID_ISSUER_SNAPSHOT,
        recipientSnapshot: VALID_RECIPIENT_SNAPSHOT,
        documentVersion,
        pdfStoragePath: path,
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });

    if (mode === "identityMismatch") {
      // Every one of the six ledger-consistency predicates matches (the
      // ledger's own storagePath is textually identical to
      // invoice.pdfStoragePath), but the row's own id (used as archiveId
      // when rebuilding the identity) is a different UUID than the one
      // actually embedded in that shared path — the exact scenario
      // test/integration/invoices/pdf-download.test.ts's own
      // "mismatchedIdentity" ledger mode already establishes and proves
      // reaches the generic 502; this file only adds the diagnostic
      // assertion on top of that already-proven behavior.
      await prisma.invoicePdfArchiveObject.create({
        data: {
          id: randomUUID(),
          organizationId: fixtures.orgA.id,
          invoiceId,
          documentVersion,
          storagePath: path,
          status: "REFERENCED",
          referencedAt: FIXED_NOW,
        },
      });
    } else {
      // A genuinely malformed persisted documentVersion (0 — not a
      // positive integer) on both the Invoice and its ledger row — real,
      // directly-written invalid data (Prisma's own Int column carries no
      // positive-only DB constraint), never a mocked pure function. The
      // six-predicate ledger query still finds this row (documentVersion
      // matches on both sides), so buildInvoicePdfStoragePath(identity)
      // is genuinely reached and throws there, rebuilding from the
      // row's own (malformed) documentVersion.
      await prisma.invoicePdfArchiveObject.create({
        data: {
          id: archiveId,
          organizationId: fixtures.orgA.id,
          invoiceId,
          documentVersion,
          storagePath: path,
          status: "REFERENCED",
          referencedAt: FIXED_NOW,
        },
      });
    }

    return invoice;
  }

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterAll(async () => {
    await prisma.invoicePdfArchiveObject.deleteMany({ where: { organizationId: fixtures.orgA.id } });
    await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: `${INVOICE_NUMBER_PREFIX}-RT-${fixtures.runId}` } } });
    await cleanupTestData(fixtures);
  });

  beforeEach(() => {
    mockedSign.mockReset().mockResolvedValue({ ok: true, url: DEFAULT_SIGNED_URL });
    mockedCheckRateLimit.mockReset().mockReturnValue({ limited: false });
  });

  afterEach(() => {
    resetAuthMock();
    vi.restoreAllMocks();
    mockedSign.mockReset();
    mockedCheckRateLimit.mockReset();
  });

  it("staff route: path_mismatch — logs the mismatch with scope 'staff', never invoiceId, and the existing generic 502/non-disclosure response is unchanged", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedMismatchedArchivedInvoice("identityMismatch");
    actAs(fixtures.owner, fixtures.orgA.id);

    const response = await staffPdfGet(new Request(`http://localhost/api/invoices/${invoice.id}/pdf`), { params: Promise.resolve({ id: invoice.id }) });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toBe("Unable to generate a download link.");
    expect(mockedSign).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(MISMATCH_EVENT_MESSAGE, { reason: "path_mismatch", scope: "staff" });
    expect(Object.keys(consoleErrorSpy.mock.calls[0][1] as object)).toEqual(["reason", "scope"]);
    expect(body).not.toContain(invoice.id);
    assertNoMarkers(consoleErrorSpy);
  });

  it("portal route: path_mismatch — logs the mismatch with scope 'portal', never invoiceId, and the existing generic 502/non-disclosure response is unchanged", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedMismatchedArchivedInvoice("identityMismatch");
    setMockAuthUser({ id: fixtures.portalUser.id, email: fixtures.portalUser.email });

    const response = await portalPdfGet(new Request(`http://localhost/api/portal/invoices/${invoice.id}/pdf`), { params: Promise.resolve({ id: invoice.id }) });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toBe("Unable to generate a download link.");
    expect(mockedSign).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(MISMATCH_EVENT_MESSAGE, { reason: "path_mismatch", scope: "portal" });
    expect(body).not.toContain(invoice.id);
    assertNoMarkers(consoleErrorSpy);
  });

  it("staff route: rebuild_failed — a malformed persisted documentVersion logs the distinct rebuild_failed reason, never path_mismatch", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedMismatchedArchivedInvoice("malformedVersion");
    actAs(fixtures.owner, fixtures.orgA.id);

    const response = await staffPdfGet(new Request(`http://localhost/api/invoices/${invoice.id}/pdf`), { params: Promise.resolve({ id: invoice.id }) });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toBe("Unable to generate a download link.");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(MISMATCH_EVENT_MESSAGE, { reason: "rebuild_failed", scope: "staff" });
  });

  it("portal route: rebuild_failed — a malformed persisted documentVersion logs the distinct rebuild_failed reason, never path_mismatch", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoice = await seedMismatchedArchivedInvoice("malformedVersion");
    setMockAuthUser({ id: fixtures.portalUser.id, email: fixtures.portalUser.email });

    const response = await portalPdfGet(new Request(`http://localhost/api/portal/invoices/${invoice.id}/pdf`), { params: Promise.resolve({ id: invoice.id }) });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toBe("Unable to generate a download link.");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(MISMATCH_EVENT_MESSAGE, { reason: "rebuild_failed", scope: "portal" });
  });

  it("staff route: a normal successful download emits no diagnostic", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoiceId = randomUUID();
    const archiveId = randomUUID();
    const path = buildInvoicePdfStoragePath({ organizationId: fixtures.orgA.id, invoiceId, documentVersion: 1, archiveId });
    const invoice = await prisma.invoice.create({
      data: {
        id: invoiceId,
        invoiceNumber: `${INVOICE_NUMBER_PREFIX}-RT-${fixtures.runId}-${invoiceId.slice(0, 8)}`,
        status: "SENT",
        amount: "100.00",
        subtotal: "100.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        finalizedAt: FIXED_NOW,
        pdfGeneratedAt: FIXED_NOW,
        issuerSnapshot: VALID_ISSUER_SNAPSHOT,
        recipientSnapshot: VALID_RECIPIENT_SNAPSHOT,
        documentVersion: 1,
        pdfStoragePath: path,
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
    await prisma.invoicePdfArchiveObject.create({
      data: { id: archiveId, organizationId: fixtures.orgA.id, invoiceId, documentVersion: 1, storagePath: path, status: "REFERENCED", referencedAt: FIXED_NOW },
    });
    actAs(fixtures.owner, fixtures.orgA.id);

    const response = await staffPdfGet(new Request(`http://localhost/api/invoices/${invoice.id}/pdf`), { params: Promise.resolve({ id: invoice.id }) });

    expect(response.status).toBe(307);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
