import { afterAll, describe, expect, it, vi } from "vitest";

// src/lib/invoices/pdf/storage.ts imports the real "server-only" marker
// package — see test/unit/cron-auth.test.ts's own header comment for the
// identical precedent. TEST_MODE is a module-level const computed once at
// first import (see test/unit/recovery-token.test.ts's own identical
// technique) — set before the dynamic import below so this module's real
// TEST_MODE branch runs directly, not a mock of it.
vi.mock("server-only", () => ({}));

const ORIGINAL_TEST_MODE = process.env.TEST_MODE;
process.env.TEST_MODE = "1";

const { buildInvoicePdfStoragePath, uploadInvoicePdfObject, removeInvoicePdfObject } = await import(
  "@/lib/invoices/pdf/storage"
);
const { testStorageRead } = await import("@/lib/storage/test-storage");

afterAll(() => {
  if (ORIGINAL_TEST_MODE === undefined) {
    delete process.env.TEST_MODE;
  } else {
    process.env.TEST_MODE = ORIGINAL_TEST_MODE;
  }
});

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "22222222-2222-4222-8222-222222222222";
const ARCHIVE_ID = "33333333-3333-4333-8333-333333333333";

describe("buildInvoicePdfStoragePath — exact path construction and validation", () => {
  it("builds the exact documented path shape", () => {
    const path = buildInvoicePdfStoragePath({
      organizationId: ORG_ID,
      invoiceId: INVOICE_ID,
      documentVersion: 1,
      archiveId: ARCHIVE_ID,
    });
    expect(path).toBe(`organizations/${ORG_ID}/invoice-pdf/${INVOICE_ID}/v1/${ARCHIVE_ID}.pdf`);
  });

  it("reflects a documentVersion other than 1 exactly", () => {
    const path = buildInvoicePdfStoragePath({
      organizationId: ORG_ID,
      invoiceId: INVOICE_ID,
      documentVersion: 3,
      archiveId: ARCHIVE_ID,
    });
    expect(path).toContain("/v3/");
  });

  it("rejects a non-UUID organizationId", () => {
    expect(() =>
      buildInvoicePdfStoragePath({ organizationId: "not-a-uuid", invoiceId: INVOICE_ID, documentVersion: 1, archiveId: ARCHIVE_ID }),
    ).toThrow(/organizationId/);
  });

  it("rejects a non-UUID invoiceId", () => {
    expect(() =>
      buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: "not-a-uuid", documentVersion: 1, archiveId: ARCHIVE_ID }),
    ).toThrow(/invoiceId/);
  });

  it("rejects a non-UUID archiveId", () => {
    expect(() =>
      buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 1, archiveId: "not-a-uuid" }),
    ).toThrow(/archiveId/);
  });

  it("rejects a zero documentVersion", () => {
    expect(() =>
      buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 0, archiveId: ARCHIVE_ID }),
    ).toThrow(/documentVersion/);
  });

  it("rejects a negative documentVersion", () => {
    expect(() =>
      buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: -1, archiveId: ARCHIVE_ID }),
    ).toThrow(/documentVersion/);
  });

  it("rejects a non-integer documentVersion", () => {
    expect(() =>
      buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 1.5, archiveId: ARCHIVE_ID }),
    ).toThrow(/documentVersion/);
  });
});

describe("uploadInvoicePdfObject / removeInvoicePdfObject — TEST_MODE create-only behavior", () => {
  it("uploads successfully to a fresh path", async () => {
    const path = buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 1, archiveId: ARCHIVE_ID });
    const body = Buffer.from("%PDF-1.3 fake pdf bytes");
    const result = await uploadInvoicePdfObject({ path, body });
    expect(result).toEqual({ ok: true });

    const stored = testStorageRead("attachments", path);
    expect(stored).not.toBeNull();
    expect(stored!.contentType).toBe("application/pdf");
    expect(stored!.body.equals(body)).toBe(true);
  });

  it("a second upload attempt to the exact same path is rejected — create-only collision, never a silent overwrite", async () => {
    const archiveId = "44444444-4444-4444-8444-444444444444";
    const path = buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 1, archiveId });
    const first = Buffer.from("%PDF-1.3 original immutable bytes");
    const second = Buffer.from("%PDF-1.3 a completely different payload");

    const firstResult = await uploadInvoicePdfObject({ path, body: first });
    expect(firstResult).toEqual({ ok: true });

    const secondResult = await uploadInvoicePdfObject({ path, body: second });
    expect(secondResult).toEqual({ ok: false, reason: "upload_failed" });

    // TEST_MODE must not silently overwrite the immutable bytes already stored.
    const stored = testStorageRead("attachments", path);
    expect(stored!.body.equals(first)).toBe(true);
  });

  it("removes exactly the uploaded object, and only that object", async () => {
    const archiveId = "55555555-5555-4555-8555-555555555555";
    const otherArchiveId = "66666666-6666-4666-8666-666666666666";
    const path = buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 1, archiveId });
    const otherPath = buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 1, archiveId: otherArchiveId });

    await uploadInvoicePdfObject({ path, body: Buffer.from("target") });
    await uploadInvoicePdfObject({ path: otherPath, body: Buffer.from("must survive") });

    const removeResult = await removeInvoicePdfObject({ path });
    expect(removeResult).toEqual({ ok: true });

    expect(testStorageRead("attachments", path)).toBeNull();
    // The unrelated object at a different path is never touched.
    expect(testStorageRead("attachments", otherPath)).not.toBeNull();
  });

  it("removing an already-absent object is treated as successful cleanup", async () => {
    const archiveId = "77777777-7777-4777-8777-777777777777";
    const path = buildInvoicePdfStoragePath({ organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 1, archiveId });
    // Never uploaded — path is already absent.
    const result = await removeInvoicePdfObject({ path });
    expect(result).toEqual({ ok: true });
  });
});

describe("uploadInvoicePdfObject — production adapter passes upsert: false", () => {
  it("calls storage.from(bucket).upload(path, body, { contentType: 'application/pdf', upsert: false })", async () => {
    const originalTestMode = process.env.TEST_MODE;
    delete process.env.TEST_MODE;
    // Re-import fresh so TEST_MODE re-evaluates to false for this one assertion.
    vi.resetModules();
    const { uploadInvoicePdfObject: uploadProd } = await import("@/lib/invoices/pdf/storage");

    const uploadMock = vi.fn().mockResolvedValue({ error: null });
    const fakeClient = {
      storage: { from: vi.fn().mockReturnValue({ upload: uploadMock }) },
    } as unknown as Parameters<typeof uploadProd>[1];

    const path = "organizations/x/invoice-pdf/y/v1/z.pdf";
    const body = Buffer.from("bytes");
    const result = await uploadProd({ path, body }, fakeClient);

    expect(result).toEqual({ ok: true });
    expect(uploadMock).toHaveBeenCalledWith(path, body, { contentType: "application/pdf", upsert: false });

    process.env.TEST_MODE = originalTestMode;
    vi.resetModules();
  });
});
