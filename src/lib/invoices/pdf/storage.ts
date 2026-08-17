import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TEST_MODE } from "@/lib/test-mode";
import { testStorageUploadIfAbsent, testStorageRemove } from "@/lib/storage/test-storage";
import { getStorageAdminClient } from "@/lib/storage/admin-client";
import { ATTACHMENTS_BUCKET } from "@/lib/storage/attachments-config";

/**
 * Invoice System Slice 3, sub-PR 3b — private Invoice PDF storage.
 * Deliberately reuses the existing private "attachments" bucket (no new
 * bucket to provision) but a dedicated namespace, never mixed with real
 * Attachment rows/paths — an archived invoice PDF is never an Attachment,
 * has no uploader, and is never user-deletable.
 *
 * organizations/<organizationId>/invoice-pdf/<invoiceId>/v<documentVersion>/<archiveId>.pdf
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PDF_CONTENT_TYPE = "application/pdf";

function assertServerUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`buildInvoicePdfStoragePath: ${label} must be a server-generated UUID.`);
  }
}

/**
 * Builds the immutable archive path internally — never accepts an
 * arbitrary caller-provided path. Throws (a programmer error, never a
 * user-facing outcome) for a non-UUID id or a non-positive
 * documentVersion, catching a future caller mistake before it ever
 * reaches Storage.
 */
export function buildInvoicePdfStoragePath({
  organizationId,
  invoiceId,
  documentVersion,
  archiveId,
}: {
  organizationId: string;
  invoiceId: string;
  documentVersion: number;
  archiveId: string;
}): string {
  assertServerUuid(organizationId, "organizationId");
  assertServerUuid(invoiceId, "invoiceId");
  assertServerUuid(archiveId, "archiveId");
  if (!Number.isInteger(documentVersion) || documentVersion < 1) {
    throw new Error("buildInvoicePdfStoragePath: documentVersion must be a positive integer.");
  }

  return `organizations/${organizationId}/invoice-pdf/${invoiceId}/v${documentVersion}/${archiveId}.pdf`;
}

export type InvoicePdfStorageFailureReason = "storage_not_configured" | "upload_failed" | "remove_failed";

export type InvoicePdfUploadResult = { ok: true } | { ok: false; reason: InvoicePdfStorageFailureReason };
export type InvoicePdfRemoveResult = { ok: true } | { ok: false; reason: InvoicePdfStorageFailureReason };

/**
 * The structured identity of exactly one Invoice PDF archive object — the
 * only thing a caller may supply to upload/remove. There is deliberately
 * no way to pass a raw string path into either function: a
 * TypeScript-only branded-string contract would still let a caller (now
 * or in the future) construct or pass through an arbitrary value at
 * runtime, so the path is instead always rebuilt internally, from these
 * four validated fields, via `buildInvoicePdfStoragePath()` — the same
 * function the caller uses to compute its own copy for ledger persistence.
 * Neither function can be pointed at an attachment path, a logo path, or
 * any other Storage namespace, because neither ever sees a path at all.
 */
export type InvoicePdfObjectIdentity = {
  organizationId: string;
  invoiceId: string;
  documentVersion: number;
  archiveId: string;
};

function resolveClient(client?: SupabaseClient): SupabaseClient | null {
  if (client) return client;
  try {
    return getStorageAdminClient();
  } catch {
    return null;
  }
}

/**
 * Uploads exactly the given bytes to the object identified by `identity` —
 * the path is always rebuilt here via `buildInvoicePdfStoragePath()`,
 * never accepted as a raw string, with true create-only semantics:
 * `upsert: false` in production; testStorageUploadIfAbsent()'s own
 * equivalent failure-on-collision behavior in TEST_MODE (never
 * testStorageUpload(), which silently overwrites). No public URL is ever
 * generated — this bucket is private, and the result type has no field
 * capable of holding one.
 */
export async function uploadInvoicePdfObject(
  { identity, body }: { identity: InvoicePdfObjectIdentity; body: Buffer },
  client?: SupabaseClient,
): Promise<InvoicePdfUploadResult> {
  const path = buildInvoicePdfStoragePath(identity);

  if (TEST_MODE) {
    const result = testStorageUploadIfAbsent(ATTACHMENTS_BUCKET, path, body, PDF_CONTENT_TYPE);
    return result.ok ? { ok: true } : { ok: false, reason: "upload_failed" };
  }

  const resolved = resolveClient(client);
  if (!resolved) return { ok: false, reason: "storage_not_configured" };

  try {
    const { error } = await resolved.storage.from(ATTACHMENTS_BUCKET).upload(path, body, {
      contentType: PDF_CONTENT_TYPE,
      upsert: false,
    });
    return error ? { ok: false, reason: "upload_failed" } : { ok: true };
  } catch {
    return { ok: false, reason: "upload_failed" };
  }
}

/**
 * Removes exactly one, exact Invoice PDF object identified by `identity` —
 * the path is always rebuilt here via `buildInvoicePdfStoragePath()`,
 * never accepted as a raw string, never batched. Treats "the object was
 * already absent" as a successful removal (Supabase's own `remove()` does
 * not error on a missing key; TEST_MODE's Map delete is a no-op either
 * way) — the caller (issue-invoice.ts's compensation step) relies on this
 * to make a retried cleanup attempt idempotent.
 */
export async function removeInvoicePdfObject(
  { identity }: { identity: InvoicePdfObjectIdentity },
  client?: SupabaseClient,
): Promise<InvoicePdfRemoveResult> {
  const path = buildInvoicePdfStoragePath(identity);

  if (TEST_MODE) {
    testStorageRemove(ATTACHMENTS_BUCKET, path);
    return { ok: true };
  }

  const resolved = resolveClient(client);
  if (!resolved) return { ok: false, reason: "storage_not_configured" };

  try {
    const { error } = await resolved.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    return error ? { ok: false, reason: "remove_failed" } : { ok: true };
  } catch {
    return { ok: false, reason: "remove_failed" };
  }
}
