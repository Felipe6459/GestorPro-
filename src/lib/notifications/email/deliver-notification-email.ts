import { prisma } from "@/lib/prisma";
import type { NotificationType, NotificationDeliveryStatus } from "@/generated/prisma/enums";
import { sendEmailViaResend, type SendEmailFn, type SendEmailResult } from "@/lib/email/resend-client";
import { resolveNotificationLinkPath } from "@/lib/notifications/format-notification";
import { shouldDeliverEmail, type NotificationPreferenceValue } from "@/lib/notifications/preferences";
import { formatNotificationEmail } from "./format-notification-email";

// MVP allowlist — evaluated per type, not per Activity, since one Activity
// can already fan out to several Notification rows of the same type (see
// INVOICE_STATUS_CHANGED's one-to-many rule) and every one of them makes
// its own independent email decision.
//
//   ROLE_CHANGED                 yes — directly affects what the recipient can do
//   OWNERSHIP_TRANSFERRED        yes — high-stakes, rare, worth an email
//   MEMBER_REMOVED               yes — the recipient may no longer be checking the app at all
//   INVITATION_ACCEPTED          NO  — the inviter is already active in the app; an
//                                      in-app badge is enough, an email is low value
//   PORTAL_INVITATION_ACCEPTED   yes — useful for the staff inviter, same reasoning as above
//   INVOICE_STATUS_CHANGED       yes, but noted — recipients are every OWNER/ADMIN in the
//                                      org (§4.2's one one-to-many fan-out rule); this can
//                                      mean an email to several people per status change.
//                                      Deliberately follows the existing Notification rows
//                                      rather than inventing a narrower email-only rule — a
//                                      digest or opt-out is a real follow-up, not MVP.
const EMAIL_ALLOWLIST: ReadonlySet<NotificationType> = new Set([
  "ROLE_CHANGED",
  "OWNERSHIP_TRANSFERRED",
  "MEMBER_REMOVED",
  "PORTAL_INVITATION_ACCEPTED",
  "INVOICE_STATUS_CHANGED",
]);

/** MVP: at most one retry attempt total — see deliverNotificationEmails's own header. */
const MAX_ATTEMPTS = 1;

export type ShouldDeliverResult =
  | { deliver: true }
  | {
      deliver: false;
      reason:
        | "disabled_by_preference"
        | "not_allowlisted"
        | "no_recipient_email"
        | "not_configured"
        | "already_resolved"
        | "retry_limit_reached";
    };

/**
 * The one place every "should we email this?" decision is made — a pure
 * function, no I/O, so every branch (user preference, allowlist, missing
 * recipient email, unconfigured provider, an already-SENT/SKIPPED row, a
 * FAILED row past its retry ceiling) is unit-testable without a database.
 * deliverNotificationEmails below is a thin orchestrator around this:
 * fetch data, call this, act on the result.
 *
 * Preference is checked before the allowlist, per Stage 7's design: a
 * user's own toggle can only narrow what would otherwise be sent, never
 * widen it past the allowlist (enabling email for a type this app never
 * emails at all still sends nothing) — the allowlist is a system-level
 * ceiling, the preference is a user-level floor beneath it.
 */
export function shouldDeliverNotificationEmail(params: {
  notification: { type: NotificationType };
  recipient: { email: string | null | undefined };
  providerConfigured: boolean;
  preference?: NotificationPreferenceValue | null;
  existingDelivery?: { status: NotificationDeliveryStatus; attemptCount: number } | null;
}): ShouldDeliverResult {
  if (params.existingDelivery) {
    const { status, attemptCount } = params.existingDelivery;
    if (status === "SENT" || status === "SKIPPED") {
      return { deliver: false, reason: "already_resolved" };
    }
    if (status === "FAILED" && attemptCount >= MAX_ATTEMPTS) {
      return { deliver: false, reason: "retry_limit_reached" };
    }
  }

  if (!shouldDeliverEmail(params.preference)) {
    return { deliver: false, reason: "disabled_by_preference" };
  }
  if (!EMAIL_ALLOWLIST.has(params.notification.type)) {
    return { deliver: false, reason: "not_allowlisted" };
  }
  if (!params.recipient.email || params.recipient.email.trim().length === 0) {
    return { deliver: false, reason: "no_recipient_email" };
  }
  if (!params.providerConfigured) {
    return { deliver: false, reason: "not_configured" };
  }

  return { deliver: true };
}

/** Same reasoning as src/lib/email/invitations.ts's own copy — never derived from a request header. */
function getAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/+$/, "");

  return "http://localhost:3000";
}

export type DeliverySummary = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
};

async function upsertSkipped(notificationId: string, failureCode: string): Promise<void> {
  await prisma.notificationDelivery.upsert({
    where: { notificationId_channel: { notificationId, channel: "EMAIL" } },
    create: { notificationId, channel: "EMAIL", status: "SKIPPED", failureCode, attemptCount: 0 },
    update: { status: "SKIPPED", failureCode, attemptedAt: null, deliveredAt: null },
  });
}

async function upsertAttempt(
  notificationId: string,
  result: { status: "SENT" | "FAILED"; failureCode: string | null },
): Promise<void> {
  const now = new Date();
  const deliveredAt = result.status === "SENT" ? now : null;
  await prisma.notificationDelivery.upsert({
    where: { notificationId_channel: { notificationId, channel: "EMAIL" } },
    create: {
      notificationId,
      channel: "EMAIL",
      status: result.status,
      attemptedAt: now,
      deliveredAt,
      failureCode: result.failureCode,
      attemptCount: 1,
    },
    update: {
      status: result.status,
      attemptedAt: now,
      deliveredAt,
      failureCode: result.failureCode,
      attemptCount: { increment: 1 },
    },
  });
}

/**
 * Best-effort, request-bound, post-commit email delivery for Notification
 * rows that already exist and are already committed. Never call this from
 * inside the prisma.$transaction() that created them (see createActivity) —
 * an email provider outage must never roll back a business mutation, and
 * this function's own failures never propagate as a throw for exactly that
 * reason: every outcome (ineligible, unconfigured, provider failure,
 * success) resolves to a NotificationDelivery row instead of an exception.
 *
 * `@@unique([notificationId, channel])` is what makes a duplicate call for
 * the same notificationIds safe — shouldDeliverNotificationEmail's
 * "already_resolved"/"retry_limit_reached" branches turn a repeat call into
 * a pure no-op instead of a second email or a constraint error.
 *
 * `deps.sendEmail` is the sole seam for tests — inject a fake to assert on
 * what was built (recipient/subject/HTML) or to simulate provider success/
 * failure, without a real Resend call. Never logs the recipient email,
 * subject, rendered body, or a raw provider error — only the coarse,
 * non-identifying `failureCode` already returned by sendEmailViaResend
 * ever reaches the database.
 */
export async function deliverNotificationEmails(
  notificationIds: string[],
  deps: { sendEmail?: SendEmailFn } = {},
): Promise<DeliverySummary> {
  const summary: DeliverySummary = { attempted: 0, sent: 0, failed: 0, skipped: 0 };
  if (notificationIds.length === 0) return summary;

  const sendEmail = deps.sendEmail ?? sendEmailViaResend;
  const fromEmail = process.env.INVITATION_FROM_EMAIL;
  const providerConfigured = Boolean(fromEmail);

  // notificationPreferences is the recipient's *entire* preference set
  // (at most 6 rows, one per NotificationType) — one join-like fetch here,
  // not a per-notification query, then matched to each row's own type
  // in-memory below.
  const notifications = await prisma.notification.findMany({
    where: { id: { in: notificationIds } },
    include: {
      recipient: { select: { email: true, notificationPreferences: true } },
      organization: { select: { name: true } },
      deliveries: { where: { channel: "EMAIL" } },
    },
  });

  for (const notification of notifications) {
    const existing = notification.deliveries[0] ?? null;
    const preferenceRow = notification.recipient.notificationPreferences.find(
      (p) => p.type === notification.type,
    );

    const decision = shouldDeliverNotificationEmail({
      notification: { type: notification.type },
      recipient: { email: notification.recipient.email },
      providerConfigured,
      preference: preferenceRow
        ? { inAppEnabled: preferenceRow.inAppEnabled, emailEnabled: preferenceRow.emailEnabled }
        : null,
      existingDelivery: existing ? { status: existing.status, attemptCount: existing.attemptCount } : null,
    });

    if (!decision.deliver) {
      // Already resolved by an earlier call — a genuine no-op, not
      // re-counted or re-written.
      if (decision.reason === "already_resolved" || decision.reason === "retry_limit_reached") {
        continue;
      }
      summary.attempted += 1;
      await upsertSkipped(notification.id, decision.reason);
      summary.skipped += 1;
      continue;
    }

    summary.attempted += 1;

    const linkPath = resolveNotificationLinkPath(notification.type, notification.entityId);
    const ctaUrl = `${getAppBaseUrl()}${linkPath ?? "/notifications"}`;
    const content = formatNotificationEmail({
      type: notification.type,
      metadata: notification.metadata,
      entityId: notification.entityId,
      organizationName: notification.organization.name,
      ctaUrl,
    });

    let result: SendEmailResult;
    try {
      // fromEmail/recipient.email are both guaranteed non-null here —
      // decision.deliver is only true when providerConfigured and
      // no_recipient_email were both already checked above.
      result = await sendEmail({
        to: notification.recipient.email as string,
        from: fromEmail as string,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
    } catch {
      // sendEmailViaResend is documented to never throw, but a DI'd
      // provider must never be trusted to uphold that — this helper stays
      // best-effort no matter what the injected function does.
      result = { ok: false, reason: "network_error" };
    }

    if (result.ok) {
      await upsertAttempt(notification.id, { status: "SENT", failureCode: null });
      summary.sent += 1;
    } else {
      await upsertAttempt(notification.id, { status: "FAILED", failureCode: result.reason });
      summary.failed += 1;
    }
  }

  return summary;
}
