import { formatStatusLabel } from "@/lib/format";
import type { NotificationType } from "@/generated/prisma/enums";

export type NotificationDisplayModel = {
  title: string;
  detail: string | null;
  timestamp: Date;
  isUnread: boolean;
  /** Allowlisted by type, never built from raw metadata — see resolveNotificationLinkPath. */
  link: string | null;
};

export type NotificationFormatInput = {
  type: NotificationType;
  metadata: unknown;
  entityId: string | null;
  createdAt: Date;
  readAt: Date | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const FALLBACK_TITLE = "Notification received";
const UNKNOWN_ACTOR = "Someone";

type PartialModel = { title: string; detail: string | null };

function buildRoleChanged(metadata: Record<string, unknown>): PartialModel {
  const actorName = str(metadata.actorName) ?? UNKNOWN_ACTOR;
  const from = str(metadata.from);
  const to = str(metadata.to);
  return {
    title: `${actorName} changed your role`,
    detail: from && to ? `${formatStatusLabel(from)} → ${formatStatusLabel(to)}` : null,
  };
}

function buildOwnershipTransferred(metadata: Record<string, unknown>): PartialModel {
  const actorName = str(metadata.actorName) ?? UNKNOWN_ACTOR;
  const previousOwnerName = str(metadata.previousOwnerName);
  const newOwnerName = str(metadata.newOwnerName);
  return {
    title: `${actorName} transferred ownership to you`,
    detail: previousOwnerName && newOwnerName ? `${previousOwnerName} → ${newOwnerName}` : null,
  };
}

function buildMemberRemoved(metadata: Record<string, unknown>): PartialModel {
  const actorName = str(metadata.actorName) ?? UNKNOWN_ACTOR;
  return { title: `${actorName} removed you from the organization`, detail: null };
}

function buildInvitationAccepted(metadata: Record<string, unknown>): PartialModel {
  const acceptedUserName = str(metadata.acceptedUserName) ?? UNKNOWN_ACTOR;
  const email = str(metadata.email);
  const role = str(metadata.role);
  return {
    title: `${acceptedUserName} accepted your invitation`,
    detail: email && role ? `${email} · ${formatStatusLabel(role)}` : null,
  };
}

function buildPortalInvitationAccepted(metadata: Record<string, unknown>): PartialModel {
  const acceptedUserName = str(metadata.acceptedUserName) ?? UNKNOWN_ACTOR;
  const clientName = str(metadata.clientName);
  const email = str(metadata.email);
  return {
    title: `${acceptedUserName} accepted Client Portal access`,
    detail: clientName && email ? `${clientName} · ${email}` : null,
  };
}

/**
 * invoiceNumber is the one field this type can't do without — with no
 * invoice to name, "changed invoice status" is meaningless, so this falls
 * back to the generic title entirely rather than rendering a half sentence.
 */
function buildInvoiceStatusChanged(metadata: Record<string, unknown>): PartialModel | null {
  const invoiceNumber = str(metadata.invoiceNumber);
  if (!invoiceNumber) return null;

  const actorName = str(metadata.actorName) ?? UNKNOWN_ACTOR;
  const from = str(metadata.from);
  const to = str(metadata.to);
  const projectName = str(metadata.projectName);
  const statusChange = from && to ? `${formatStatusLabel(from)} → ${formatStatusLabel(to)}` : null;

  return {
    title: `${actorName} changed invoice ${invoiceNumber} status`,
    detail: statusChange ? (projectName ? `${statusChange} · ${projectName}` : statusChange) : null,
  };
}

/**
 * Comments & Mentions Stage 3 (docs/comments-architecture.md §5/§6).
 * commentPreview is already a bounded, whitespace-collapsed plain-text
 * string (src/lib/comments/preview.ts) — rendered as-is, never re-escaped
 * or reinterpreted as markup.
 */
function buildMentioned(metadata: Record<string, unknown>): PartialModel {
  const actorName = str(metadata.actorName) ?? UNKNOWN_ACTOR;
  const commentPreview = str(metadata.commentPreview);
  return {
    title: `${actorName} mentioned you in a comment`,
    detail: commentPreview,
  };
}

function buildModel(type: NotificationType, metadata: Record<string, unknown>): PartialModel | null {
  switch (type) {
    case "ROLE_CHANGED":
      return buildRoleChanged(metadata);
    case "OWNERSHIP_TRANSFERRED":
      return buildOwnershipTransferred(metadata);
    case "MEMBER_REMOVED":
      return buildMemberRemoved(metadata);
    case "INVITATION_ACCEPTED":
      return buildInvitationAccepted(metadata);
    case "PORTAL_INVITATION_ACCEPTED":
      return buildPortalInvitationAccepted(metadata);
    case "INVOICE_STATUS_CHANGED":
      return buildInvoiceStatusChanged(metadata);
    case "MENTIONED":
      return buildMentioned(metadata);
    default:
      // Defensive only — NotificationType has no other value today, but a
      // future enum addition without a matching case here must degrade to
      // the generic fallback, never throw.
      return null;
  }
}

/**
 * Allowlisted per type — never built from arbitrary metadata. MEMBERSHIP/
 * INVITATION notifications point at /team (a list page, not a per-id
 * route, so there's nothing to 404 on). INVOICE_STATUS_CHANGED points at
 * the real /invoices/[id]/edit route, which already renders its own
 * notFound() for a deleted invoice — no link is safer than a broken one,
 * but this one degrades gracefully instead of needing a live check here.
 * PORTAL_INVITATION_ACCEPTED gets no link: its Notification.metadata only
 * ever carries clientName (a display string), never a clientId, so there is
 * no reliable id to build /clients/[id]/edit from.
 *
 * Exported so the email formatter (src/lib/notifications/email/format-
 * notification-email.ts) builds its CTA from this exact same allowlist
 * instead of a second NotificationType switch — one link-path decision,
 * two channels rendering it differently (a relative in-app href here, an
 * absolute APP_BASE_URL-prefixed URL there).
 */
export function resolveNotificationLinkPath(type: NotificationType, entityId: string | null): string | null {
  switch (type) {
    case "ROLE_CHANGED":
    case "OWNERSHIP_TRANSFERRED":
    case "MEMBER_REMOVED":
    case "INVITATION_ACCEPTED":
      return "/team";
    case "INVOICE_STATUS_CHANGED":
      return entityId ? `/invoices/${entityId}/edit` : null;
    // Comments & Mentions Stage 3: no link yet, deliberately, same reasoning
    // as PORTAL_INVITATION_ACCEPTED above. dispatch-notifications.ts (left
    // untouched this stage) copies the source Activity's own entityType/
    // entityId onto every Notification row unconditionally — for a
    // COMMENT/CREATED or COMMENT/UPDATED Activity that's the Comment's own
    // id, not its parent Project/Task id, and this function only receives
    // entityId (no entityType) to build a path from. Building a safe
    // Project/Task link from just a Comment id needs either a lookup at
    // render time or a schema/dispatch change, neither of which this
    // backend-only stage makes — left as an explicit open question for the
    // UI stage rather than guessed at here.
    case "MENTIONED":
    case "PORTAL_INVITATION_ACCEPTED":
    default:
      return null;
  }
}

/**
 * Converts a raw Notification row into a safe display model. Never throws
 * and never renders metadata directly — every field is read defensively,
 * and anything missing/malformed falls back to a neutral "Notification
 * received" line with no link, rather than crashing the dropdown.
 */
export function formatNotification(input: NotificationFormatInput): NotificationDisplayModel {
  const metadata = isRecord(input.metadata) ? input.metadata : {};

  let partial: PartialModel | null;
  try {
    partial = buildModel(input.type, metadata);
  } catch {
    partial = null;
  }

  return {
    title: partial?.title ?? FALLBACK_TITLE,
    detail: partial?.detail ?? null,
    timestamp: input.createdAt,
    isUnread: input.readAt === null,
    link: partial ? resolveNotificationLinkPath(input.type, input.entityId) : null,
  };
}
