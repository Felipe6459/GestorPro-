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
