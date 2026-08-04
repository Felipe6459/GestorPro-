import type { Prisma } from "@/generated/prisma/client";

// Each builder below picks an explicit, small allowlist of fields out of the
// already-existing Activity.metadata object (see src/lib/activity/*-metadata.ts)
// for its NotificationType. Deliberately NOT a passthrough of the whole
// object — Notification.metadata must never carry a token, storagePath,
// signed URL, provider response, notes, or raw formData, even if some
// future Activity metadata shape were to include one.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function buildRoleChangedNotificationMetadata(activityMetadata: unknown): Prisma.InputJsonValue {
  const m = isRecord(activityMetadata) ? activityMetadata : {};
  return { actorName: str(m.actorName), from: str(m.from), to: str(m.to) };
}

export function buildOwnershipTransferredNotificationMetadata(
  activityMetadata: unknown,
): Prisma.InputJsonValue {
  const m = isRecord(activityMetadata) ? activityMetadata : {};
  return {
    actorName: str(m.actorName),
    previousOwnerName: str(m.previousOwnerName),
    newOwnerName: str(m.newOwnerName),
  };
}

export function buildMemberRemovedNotificationMetadata(activityMetadata: unknown): Prisma.InputJsonValue {
  const m = isRecord(activityMetadata) ? activityMetadata : {};
  return { actorName: str(m.actorName), memberName: str(m.memberName) };
}

export function buildInvitationAcceptedNotificationMetadata(
  activityMetadata: unknown,
): Prisma.InputJsonValue {
  const m = isRecord(activityMetadata) ? activityMetadata : {};
  return {
    actorName: str(m.actorName),
    acceptedUserName: str(m.memberName),
    email: str(m.email),
    role: str(m.role),
  };
}

export function buildPortalInvitationAcceptedNotificationMetadata(
  activityMetadata: unknown,
): Prisma.InputJsonValue {
  const m = isRecord(activityMetadata) ? activityMetadata : {};
  return {
    acceptedUserName: str(m.portalUserName),
    email: str(m.portalUserEmail),
    clientName: str(m.clientName),
  };
}

export function buildInvoiceStatusChangedNotificationMetadata(
  activityMetadata: unknown,
): Prisma.InputJsonValue {
  const m = isRecord(activityMetadata) ? activityMetadata : {};
  return {
    invoiceNumber: str(m.invoiceNumber),
    from: str(m.from),
    to: str(m.to),
    projectName: str(m.projectName),
  };
}

/**
 * Comments & Mentions Stage 3 (docs/comments-architecture.md §5/§6). The
 * source Activity row is either a COMMENT/CREATED or a COMMENT/UPDATED
 * event (src/lib/activity/comment-metadata.ts) — both already carry
 * exactly these four fields, so this picks the same allowlist regardless
 * of which action produced it. Deliberately excludes the full comment
 * body (only the already-bounded commentPreview travels here), the raw
 * mention token, any user/comment/project/task/organization id, and any
 * email — matching the same discipline every other builder in this file
 * follows.
 */
export function buildMentionedNotificationMetadata(activityMetadata: unknown): Prisma.InputJsonValue {
  const m = isRecord(activityMetadata) ? activityMetadata : {};
  return {
    actorName: str(m.actorName),
    commentPreview: str(m.commentPreview),
    parentEntityType: str(m.parentEntityType),
    parentEntityLabel: str(m.parentEntityLabel),
  };
}
