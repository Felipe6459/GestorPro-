import { SUSPENSION_REASON_CODES, type SuspensionReasonCode } from "./organization-suspension-reasons";

/**
 * Recent Admin Actions (Organization Detail). A small, server-safe
 * formatter for PlatformAdminAuditEvent's two bounded, catalog-backed
 * fields — deliberately its own plain module, not shared with
 * organization-suspension-controls.tsx's own client-side REASON_LABELS:
 * that map exists to label the *live confirmation dialog's* reason
 * <select>, a Client Component concern; this one formats *already
 * written, historical* rows for a Server Component read path. Coupling
 * the two would mean a dialog-only wording change could silently change
 * historical audit display, or vice versa — two different concerns that
 * happen to share a reason catalog, not one.
 *
 * Both functions accept plain `string` (not the narrow Prisma enum/
 * catalog union) and always return a display string, never throwing —
 * `action` is a real Postgres enum column today, but a future migration
 * that adds a new value ships before every reader is necessarily
 * updated; `reasonCode` is a plain nullable string column with no DB-
 * level constraint at all. An unrecognized value must degrade to
 * something readable, never crash this page or hide the row.
 */

const ACTION_LABELS: Record<string, string> = {
  ORGANIZATION_SUSPENDED: "Suspended",
  ORGANIZATION_REACTIVATED: "Reactivated",
};

const REASON_LABELS: Record<SuspensionReasonCode, string> = {
  BILLING_DISPUTE: "Billing dispute",
  POLICY_VIOLATION: "Policy violation",
  SECURITY_RISK: "Security risk",
  CUSTOMER_REQUEST: "Customer request",
  OTHER: "Other",
};

function isKnownReasonCode(value: string): value is SuspensionReasonCode {
  return (SUSPENSION_REASON_CODES as readonly string[]).includes(value);
}

/** A known action always gets its friendly label; an unrecognized one falls back to the raw value rather than crashing or disappearing. */
export function formatAuditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** `null` (Reactivate never sets one) stays `null` — the caller renders nothing for it, never a placeholder like "None." A non-null but unrecognized code (future catalog entry) still renders as its own raw value. */
export function formatAuditReasonLabel(reasonCode: string | null): string | null {
  if (reasonCode === null) return null;
  return isKnownReasonCode(reasonCode) ? REASON_LABELS[reasonCode] : reasonCode;
}
