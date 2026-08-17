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

function identity(archiveId: string, overrides: Partial<{ organizationId: string; invoiceId: string; documentVersion: number }> = {}) {
  return { organizationId: overrides.organizationId ?? ORG_ID, invoiceId: overrides.invoiceId ?? INVOICE_ID, documentVersion: overrides.documentVersion ?? 1, archiveId };
}

describe("uploadInvoicePdfObject / removeInvoicePdfObject — accept only a structured identity, never a raw path", () => {
  it("uploads successfully for a fresh identity", async () => {
    const result = await uploadInvoicePdfObject({ identity: identity(ARCHIVE_ID), body: Buffer.from("%PDF-1.3 fake pdf bytes") });
    expect(result).toEqual({ ok: true });

    const path = buildInvoicePdfStoragePath(identity(ARCHIVE_ID));
    const stored = testStorageRead("attachments", path);
    expect(stored).not.toBeNull();
    expect(stored!.contentType).toBe("application/pdf");
  });

  it("a second upload attempt for the exact same identity is rejected — create-only collision, never a silent overwrite", async () => {
    const archiveId = "44444444-4444-4444-8444-444444444444";
    const first = Buffer.from("%PDF-1.3 original immutable bytes");
    const second = Buffer.from("%PDF-1.3 a completely different payload");

    const firstResult = await uploadInvoicePdfObject({ identity: identity(archiveId), body: first });
    expect(firstResult).toEqual({ ok: true });

    const secondResult = await uploadInvoicePdfObject({ identity: identity(archiveId), body: second });
    expect(secondResult).toEqual({ ok: false, reason: "upload_failed" });

    // TEST_MODE must not silently overwrite the immutable bytes already stored.
    const path = buildInvoicePdfStoragePath(identity(archiveId));
    const stored = testStorageRead("attachments", path);
    expect(stored!.body.equals(first)).toBe(true);
  });

  it("removes exactly the object identified, and only that object", async () => {
    const archiveId = "55555555-5555-4555-8555-555555555555";
    const otherArchiveId = "66666666-6666-4666-8666-666666666666";

    await uploadInvoicePdfObject({ identity: identity(archiveId), body: Buffer.from("target") });
    await uploadInvoicePdfObject({ identity: identity(otherArchiveId), body: Buffer.from("must survive") });

    const removeResult = await removeInvoicePdfObject({ identity: identity(archiveId) });
    expect(removeResult).toEqual({ ok: true });

    expect(testStorageRead("attachments", buildInvoicePdfStoragePath(identity(archiveId)))).toBeNull();
    // The unrelated object at a different identity is never touched.
    expect(testStorageRead("attachments", buildInvoicePdfStoragePath(identity(otherArchiveId)))).not.toBeNull();
  });

  it("removing an already-absent object is treated as successful cleanup", async () => {
    const archiveId = "77777777-7777-4777-8777-777777777777";
    // Never uploaded — the object at this identity's path is already absent.
    const result = await removeInvoicePdfObject({ identity: identity(archiveId) });
    expect(result).toEqual({ ok: true });
  });

  it("cannot be pointed at an existing attachment object's path — the identity always resolves inside the invoice-pdf namespace, never elsewhere in the shared bucket", async () => {
    const { testStorageUpload } = await import("@/lib/storage/test-storage");
    const attachmentPath = `organizations/${ORG_ID}/attachments/some-real-attachment-id.pdf`;
    testStorageUpload("attachments", attachmentPath, Buffer.from("a real attachment, never touched by Invoice PDF archival"), "application/pdf");

    // Even with an identity built from the exact same organizationId, the
    // rebuilt path always lands under invoice-pdf/, never at an arbitrary
    // attachment path — removeInvoicePdfObject has no way to target
    // attachmentPath at all.
    const archiveId = "88888888-8888-4888-8888-888888888888";
    const result = await removeInvoicePdfObject({ identity: identity(archiveId) });
    expect(result).toEqual({ ok: true }); // absent-at-its-own-path, still a no-op success

    // The unrelated attachment object is completely untouched.
    expect(testStorageRead("attachments", attachmentPath)).not.toBeNull();
  });

  it("cannot be pointed at a logo object's path — the invoice-pdf namespace never collides with organizations/<org>/logo/", async () => {
    const { testStorageUpload } = await import("@/lib/storage/test-storage");
    const logoPath = `organizations/${ORG_ID}/logo/${ARCHIVE_ID}.png`;
    testStorageUpload("logos", logoPath, Buffer.from("a real logo, never touched by Invoice PDF archival"), "image/png");

    const result = await removeInvoicePdfObject({ identity: identity(ARCHIVE_ID) });
    expect(result).toEqual({ ok: true });
    // Different bucket entirely ("logos" vs "attachments") — completely untouched.
    expect(testStorageRead("logos", logoPath)).not.toBeNull();
  });

  it("rejects an identity with an invalid organizationId/invoiceId/archiveId or documentVersion before any Storage call", async () => {
    await expect(uploadInvoicePdfObject({ identity: { organizationId: "not-a-uuid", invoiceId: INVOICE_ID, documentVersion: 1, archiveId: ARCHIVE_ID }, body: Buffer.from("x") })).rejects.toThrow(/organizationId/);
    await expect(uploadInvoicePdfObject({ identity: { organizationId: ORG_ID, invoiceId: "not-a-uuid", documentVersion: 1, archiveId: ARCHIVE_ID }, body: Buffer.from("x") })).rejects.toThrow(/invoiceId/);
    await expect(uploadInvoicePdfObject({ identity: { organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 1, archiveId: "not-a-uuid" }, body: Buffer.from("x") })).rejects.toThrow(/archiveId/);
    await expect(uploadInvoicePdfObject({ identity: { organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 0, archiveId: ARCHIVE_ID }, body: Buffer.from("x") })).rejects.toThrow(/documentVersion/);
    await expect(removeInvoicePdfObject({ identity: { organizationId: "not-a-uuid", invoiceId: INVOICE_ID, documentVersion: 1, archiveId: ARCHIVE_ID } })).rejects.toThrow(/organizationId/);
  });
});

describe("uploadInvoicePdfObject — production adapter passes upsert: false", () => {
  it("calls storage.from(bucket).upload(path, body, { contentType: 'application/pdf', upsert: false })", async () => {
    const originalTestMode = process.env.TEST_MODE;
    delete process.env.TEST_MODE;
    // Re-import fresh so TEST_MODE re-evaluates to false for this one assertion.
    vi.resetModules();
    const { uploadInvoicePdfObject: uploadProd, buildInvoicePdfStoragePath: buildPathProd } = await import("@/lib/invoices/pdf/storage");

    const uploadMock = vi.fn().mockResolvedValue({ error: null });
    const fakeClient = {
      storage: { from: vi.fn().mockReturnValue({ upload: uploadMock }) },
    } as unknown as Parameters<typeof uploadProd>[1];

    const prodIdentity = { organizationId: ORG_ID, invoiceId: INVOICE_ID, documentVersion: 1, archiveId: ARCHIVE_ID };
    const body = Buffer.from("bytes");
    const result = await uploadProd({ identity: prodIdentity, body }, fakeClient);

    expect(result).toEqual({ ok: true });
    expect(uploadMock).toHaveBeenCalledWith(buildPathProd(prodIdentity), body, { contentType: "application/pdf", upsert: false });

    process.env.TEST_MODE = originalTestMode;
    vi.resetModules();
  });
});
