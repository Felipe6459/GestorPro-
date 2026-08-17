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

function resolveClient(client?: SupabaseClient): SupabaseClient | null {
  if (client) return client;
  try {
    return getStorageAdminClient();
  } catch {
    return null;
  }
}

/**
 * Uploads exactly the given bytes to exactly the given (already-validated,
 * internally-built) path, with true create-only semantics — `upsert:
 * false` in production; testStorageUploadIfAbsent()'s own equivalent
 * failure-on-collision behavior in TEST_MODE (never testStorageUpload(),
 * which silently overwrites). No public URL is ever generated — this
 * bucket is private, and the result type has no field capable of holding
 * one.
 */
export async function uploadInvoicePdfObject(
  { path, body }: { path: string; body: Buffer },
  client?: SupabaseClient,
): Promise<InvoicePdfUploadResult> {
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
 * Removes exactly one, exact, already-known Invoice PDF path — never a
 * caller-supplied arbitrary path, never batched. Treats "the object was
 * already absent" as a successful removal (Supabase's own `remove()` does
 * not error on a missing key; TEST_MODE's Map delete is a no-op either
 * way) — the caller (issue-invoice.ts's compensation step) relies on this
 * to make a retried cleanup attempt idempotent.
 */
export async function removeInvoicePdfObject(
  { path }: { path: string },
  client?: SupabaseClient,
): Promise<InvoicePdfRemoveResult> {
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
