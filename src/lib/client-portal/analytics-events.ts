import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * Portal Analytics persistence foundation (docs/analytics-architecture.md
 * §12, Slice 1). Defined locally rather than imported from
 * src/lib/analytics/types.ts's own PrismaClientOrTx — this module lives
 * outside the analytics domain on purpose (see the "why outside
 * src/lib/analytics" note below), and the analytics domain's own type is
 * an internal detail of that (read-only, pure) domain, not a shared
 * cross-domain contract. Same shape, defined independently, matching
 * src/lib/billing/usage.ts's own precedent for exactly this situation.
 */
type PortalAnalyticsClientOrTx = typeof prisma | Prisma.TransactionClient;

/**
 * The write side of Portal Analytics — deliberately kept out of
 * src/lib/analytics/, which is read-only/pure by its own established
 * convention (no Prisma writes, no I/O beyond reads, no console logging
 * — see check-analytics-security.mjs's own checks #6/#8). Both functions
 * here are best-effort: a failure must never block the real, user-facing
 * action it's attached to (a successful login, a successful download
 * link) — every caller can safely `await` the call without checking the
 * result if it doesn't need to; the boolean return exists for tests and
 * any future caller that does want to know.
 *
 * Failure signaling is deliberately a fixed, sanitized string via
 * console.error — never the caught error object, never any identifier
 * (portalUserId/organizationId/attachmentId/email), never a signed URL or
 * storage path. This is not a generic logging framework; it's the
 * smallest signal that a persistent failure here is at least visible
 * somewhere, until a real observability provider exists to replace it.
 *
 * Stability Correction F5 — the fixed string alone couldn't distinguish
 * "an ordinary, already-expected persistence failure" from "something
 * structurally unexpected," which is exactly the triage signal an
 * on-call reader needs and the only thing genuinely missing here.
 * `classifyAnalyticsFailure` adds exactly one bounded, two-value field —
 * derived with a single `instanceof` type check that never reads any
 * property of the thrown value (so it is equally safe for an Error, a
 * string, a plain object, or null/undefined) — never the error object
 * itself, never `.message`/`.stack`/`.cause`/`.digest`/Prisma `meta`, and
 * never any dynamic serialization of what was thrown.
 */

/** The one bounded, two-value failure classification this module ever logs. */
type AnalyticsFailureClassification = "known_error" | "unexpected";

/**
 * A recognized Prisma error class (any code) is classified as
 * "known_error" — an ordinary, already-anticipated persistence failure
 * shape (e.g. the target row no longer exists, a constraint was
 * violated). Anything else — a plain Error, a thrown string/object,
 * null, undefined, or any other shape — is "unexpected": the generic,
 * safe default this module falls back to for every case it does not
 * specifically recognize. The check never accesses any property of
 * `err` (no `.code`, `.message`, `.meta`, ...), so it cannot itself leak
 * anything about the failure's content.
 */
function classifyAnalyticsFailure(err: unknown): AnalyticsFailureClassification {
  return err instanceof Prisma.PrismaClientKnownRequestError ? "known_error" : "unexpected";
}

/**
 * The one shared logging point for both functions below — `message` is
 * always one of the two fixed, hard-coded strings already established
 * for this module, never built from `err` in any way. `err` is used only
 * to compute `classification`; it is never itself passed to
 * console.error, so nothing beyond this one allowlisted field can ever
 * reach the log line, regardless of what was thrown.
 */
function logAnalyticsFailure(message: string, err: unknown): void {
  console.error(message, { classification: classifyAnalyticsFailure(err) });
}

/**
 * Updates PortalUser.lastLoginAt to `occurredAt` — called only from an
 * explicit, credential-backed portal sign-in (never from session-cookie
 * resolution). `occurredAt` defaults to `new Date()` but is accepted
 * explicitly so integration tests get a deterministic, reproducible
 * timestamp, the same pattern getOrganizationAnalytics() already
 * establishes for `now`.
 */
export async function recordPortalLogin(
  client: PortalAnalyticsClientOrTx,
  portalUserId: string,
  occurredAt: Date = new Date(),
): Promise<boolean> {
  try {
    await client.portalUser.update({
      where: { id: portalUserId },
      data: { lastLoginAt: occurredAt },
    });
    return true;
  } catch (err) {
    logAnalyticsFailure("[portal-analytics] Failed to record portal login.", err);
    return false;
  }
}

/**
 * Creates exactly one PortalDownloadRequest row for `organizationId` —
 * called only after a portal attachment download request has already
 * passed every authorization check and successfully received a signed
 * URL (see the download route's own call site). `requestedAt` defaults to
 * `new Date()`, accepted explicitly for the same test-determinism reason
 * as recordPortalLogin's `occurredAt`.
 */
export async function recordPortalDownloadRequest(
  client: PortalAnalyticsClientOrTx,
  organizationId: string,
  requestedAt: Date = new Date(),
): Promise<boolean> {
  try {
    await client.portalDownloadRequest.create({
      data: { organizationId, requestedAt },
    });
    return true;
  } catch (err) {
    logAnalyticsFailure("[portal-analytics] Failed to record portal download-link request.", err);
    return false;
  }
}
