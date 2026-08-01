import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorageAdminClient } from "./admin-client";
import { ATTACHMENTS_BUCKET, SIGNED_URL_TTL_SECONDS } from "./attachments-config";

export type StorageFailureReason =
  | "not_configured"
  | "upload_failed"
  | "remove_failed"
  | "signed_url_failed";

export type StorageOperationResult = { ok: true } | { ok: false; reason: StorageFailureReason };
export type SignedUrlResult = { ok: true; url: string } | { ok: false; reason: StorageFailureReason };

/**
 * Resolves the admin client for each call rather than once at module load,
 * so a missing env var is reported per-operation (not_configured) instead of
 * throwing at import time. Callers may inject a client (or a mock satisfying
 * the same shape) for tests; production code should always omit it and let
 * this resolve the real admin client.
 */
function resolveClient(client?: SupabaseClient): SupabaseClient | null {
  if (client) return client;
  try {
    return getStorageAdminClient();
  } catch {
    return null;
  }
}

/**
 * Uploads a single object. `upsert` is hardcoded to false — attachment paths
 * are always fresh (built from a new attachmentId), so a collision here is
 * always a bug, never an intended overwrite. `contentType` must come from
 * validateAttachmentFile()'s result, never the raw client-declared MIME.
 */
export async function uploadAttachmentObject(
  {
    bucket = ATTACHMENTS_BUCKET,
    path,
    body,
    contentType,
  }: {
    bucket?: string;
    path: string;
    body: Blob | ArrayBuffer | Uint8Array;
    contentType: string;
  },
  client?: SupabaseClient,
): Promise<StorageOperationResult> {
  const resolved = resolveClient(client);
  if (!resolved) return { ok: false, reason: "not_configured" };

  try {
    const { error } = await resolved.storage.from(bucket).upload(path, body, {
      contentType,
      upsert: false,
    });
    return error ? { ok: false, reason: "upload_failed" } : { ok: true };
  } catch {
    return { ok: false, reason: "upload_failed" };
  }
}

/**
 * Removes exactly one object per call — batching is intentionally not
 * exposed here, since every current caller (delete flows) acts on a single
 * Attachment row at a time.
 */
export async function removeAttachmentObject(
  { bucket = ATTACHMENTS_BUCKET, path }: { bucket?: string; path: string },
  client?: SupabaseClient,
): Promise<StorageOperationResult> {
  const resolved = resolveClient(client);
  if (!resolved) return { ok: false, reason: "not_configured" };

  try {
    const { error } = await resolved.storage.from(bucket).remove([path]);
    return error ? { ok: false, reason: "remove_failed" } : { ok: true };
  } catch {
    return { ok: false, reason: "remove_failed" };
  }
}

/**
 * TTL is clamped to the config ceiling regardless of what a caller passes in
 * — no caller may request a longer-lived signed URL than SIGNED_URL_TTL_SECONDS.
 */
export async function createAttachmentSignedUrl(
  {
    bucket = ATTACHMENTS_BUCKET,
    path,
    expiresInSeconds,
  }: { bucket?: string; path: string; expiresInSeconds?: number },
  client?: SupabaseClient,
): Promise<SignedUrlResult> {
  const resolved = resolveClient(client);
  if (!resolved) return { ok: false, reason: "not_configured" };

  const ttl = Math.min(expiresInSeconds ?? SIGNED_URL_TTL_SECONDS, SIGNED_URL_TTL_SECONDS);

  try {
    const { data, error } = await resolved.storage.from(bucket).createSignedUrl(path, ttl);
    return error || !data?.signedUrl
      ? { ok: false, reason: "signed_url_failed" }
      : { ok: true, url: data.signedUrl };
  } catch {
    return { ok: false, reason: "signed_url_failed" };
  }
}

export type BucketReadiness =
  | { ready: true }
  | { ready: false; reason: "not_configured" | "bucket_missing" | "unavailable" };

/**
 * Read-only check — never creates the bucket. A missing bucket is a distinct,
 * expected outcome (this stage deliberately does not create it) from any
 * other Storage API failure, so the two are reported separately rather than
 * collapsed into one generic error.
 *
 * The Supabase JS SDK reports a missing bucket as a StorageApiError with
 * statusCode "404" (a string) and message "Bucket not found" — verified
 * empirically against a real project with no buckets configured. Both the
 * statusCode and a message fallback are checked so this stays correct even
 * if the SDK's exact shape shifts slightly across versions.
 */
export async function checkAttachmentsBucket(client?: SupabaseClient): Promise<BucketReadiness> {
  const resolved = resolveClient(client);
  if (!resolved) return { ready: false, reason: "not_configured" };

  try {
    const { data, error } = await resolved.storage.getBucket(ATTACHMENTS_BUCKET);
    if (!error && data) return { ready: true };

    const statusCode = (error as { statusCode?: string } | null)?.statusCode;
    const message = error?.message ?? "";
    const isMissing = statusCode === "404" || /not found/i.test(message);
    return { ready: false, reason: isMissing ? "bucket_missing" : "unavailable" };
  } catch {
    return { ready: false, reason: "unavailable" };
  }
}
