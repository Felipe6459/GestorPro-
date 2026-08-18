import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { TEST_MODE } from "@/lib/test-mode";
import { testStorageUploadIfAbsent, testStorageRemove } from "@/lib/storage/test-storage";
import { getStorageAdminClient } from "@/lib/storage/admin-client";
import { ATTACHMENTS_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/storage/attachments-config";

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

// Invoice System Official Slice 3, sub-PR 3c — deterministic, exact
// filename contract for the staff signed-download route. MAX_STEM_LENGTH
// bounds the sanitized invoice-number component; FALLBACK_FILENAME is
// returned whenever sanitization empties that component entirely (an
// empty, Unicode-only, or punctuation-only invoice number).
const MAX_STEM_LENGTH = 100;
const FALLBACK_FILENAME = "Invoice.pdf";

/**
 * Exact execution order (never reordered — each step depends on the
 * previous one already having run):
 *  1. Trim.
 *  2. Unicode-normalize to NFKD, splitting composed/accented characters
 *     into a base character plus combining marks.
 *  3. Strip combining marks (U+0300-U+036F).
 *  4. Replace every RUN of characters outside [A-Za-z0-9] with exactly one
 *     hyphen — a run, not per-character removal, so e.g. "A/B" becomes
 *     "A-B", never the character-joining "AB". This one step alone
 *     removes every remaining non-ASCII character, every control
 *     character (including NUL/CR/LF), both quote characters, and both
 *     path separators (`/`, `\`).
 *  5. Strip a leading and trailing hyphen, if present.
 *  6. Truncate to MAX_STEM_LENGTH characters.
 *  7. Strip a trailing hyphen again — truncation in step 6 can newly
 *     expose one if the cut point lands inside what was an interior
 *     separator run.
 *  8. Empty result -> return the fixed FALLBACK_FILENAME outright.
 *     Otherwise -> "Invoice-<stem>.pdf".
 *
 * Every character in a non-fallback result is one of [A-Za-z0-9-] (the
 * stem) plus the fixed "Invoice-"/".pdf" literals — nothing after step 4
 * ever reintroduces a disallowed character. Maximum length: 8 ("Invoice-")
 * + 100 (stem) + 4 (".pdf") = 112 ASCII bytes; the fallback path is fixed
 * at 12 bytes ("Invoice.pdf").
 */
export function buildInvoicePdfDownloadFilename(rawInvoiceNumber: string): string {
  const trimmed = rawInvoiceNumber.trim();
  const decomposed = trimmed.normalize("NFKD");
  const marksRemoved = decomposed.replace(/[\u0300-\u036f]/g, "");
  const collapsed = marksRemoved.replace(/[^A-Za-z0-9]+/g, "-");
  const edgesTrimmed = collapsed.replace(/^-+/, "").replace(/-+$/, "");
  const truncated = edgesTrimmed.slice(0, MAX_STEM_LENGTH);
  const stem = truncated.replace(/-+$/, "");

  return stem.length > 0 ? `Invoice-${stem}.pdf` : FALLBACK_FILENAME;
}

export type InvoicePdfSignedUrlFailureReason = "storage_not_configured" | "signed_url_failed";

export type InvoicePdfSignedUrlResult = { ok: true; url: string } | { ok: false; reason: InvoicePdfSignedUrlFailureReason };

/**
 * Issues a short-lived signed download URL for exactly one archived
 * Invoice PDF object. Accepts only a structured `identity` — the path is
 * always rebuilt internally via `buildInvoicePdfStoragePath()`, exactly
 * like upload/remove above, never accepted as a raw string. The download
 * filename is generated internally from `invoiceNumber` (never accepted
 * pre-built), and the TTL is always the fixed `SIGNED_URL_TTL_SECONDS`
 * ceiling — there is no `expiresInSeconds` parameter for a caller to
 * override.
 */
export async function createInvoicePdfSignedUrl(
  { identity, invoiceNumber }: { identity: InvoicePdfObjectIdentity; invoiceNumber: string },
  client?: SupabaseClient,
): Promise<InvoicePdfSignedUrlResult> {
  const path = buildInvoicePdfStoragePath(identity);
  const filename = buildInvoicePdfDownloadFilename(invoiceNumber);

  if (TEST_MODE) {
    // No real Storage to sign a URL against — points at the TEST_MODE-only
    // serving route instead (src/app/api/e2e-test-storage/[...path]/route.ts,
    // itself gated on this same TEST_MODE flag), mirroring
    // createAttachmentSignedUrl()'s own identical technique exactly.
    // headers() reads the incoming request's own host — never a hardcoded
    // origin — and this always runs inside a Route Handler. Deterministic:
    // no random component, no timestamp.
    const h = await headers();
    const host = h.get("host") ?? "127.0.0.1";
    const proto = h.get("x-forwarded-proto") ?? "http";
    return { ok: true, url: `${proto}://${host}/api/e2e-test-storage/${ATTACHMENTS_BUCKET}/${path}` };
  }

  const resolved = resolveClient(client);
  if (!resolved) return { ok: false, reason: "storage_not_configured" };

  try {
    const { data, error } = await resolved.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
      download: filename,
    });
    return error || !data?.signedUrl ? { ok: false, reason: "signed_url_failed" } : { ok: true, url: data.signedUrl };
  } catch {
    return { ok: false, reason: "signed_url_failed" };
  }
}
