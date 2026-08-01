import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { createActivity } from "@/lib/activity/create-activity";
import { buildAttachmentActivityMetadata } from "@/lib/activity/attachment-metadata";
import {
  sanitizeAttachmentFileName,
  validateAttachmentFile,
  buildAttachmentStoragePath,
} from "@/lib/storage/attachment-files";
import { uploadAttachmentObject, removeAttachmentObject } from "@/lib/storage/attachments-storage";
import { ATTACHMENTS_BUCKET, MAX_ATTACHMENTS_PER_ENTITY } from "@/lib/storage/attachments-config";
import type { AttachmentEntityType } from "@/generated/prisma/enums";
import type { AttachmentUploadState } from "@/types";

const VALIDATION_ERROR_MESSAGES: Record<string, string> = {
  empty_file: "The selected file is empty.",
  file_too_large: "This file is too large. Maximum size is 10 MB.",
  type_not_allowed: "This file type is not supported.",
  extension_mismatch: "The file extension doesn't match its detected type.",
};

/**
 * Entity-agnostic core of the attachment upload flow, extracted from the
 * original Client-only implementation (Stage 4) so Project (and any future
 * entity) can reuse it verbatim: count limit, file extraction, validation,
 * sanitization, Storage upload, then the Attachment + FILE_UPLOADED
 * transaction, with best-effort Storage compensation if the transaction
 * fails. Callers are responsible for resolving and authorizing the parent
 * entity (Client/Project/...) themselves before calling this, and for
 * revalidating their own page path afterwards on success.
 */
export async function uploadAttachmentForEntity({
  organizationId,
  actorId,
  actorName,
  entityType,
  entityId,
  parentEntityLabel,
  formData,
}: {
  organizationId: string;
  actorId: string;
  actorName: string;
  entityType: AttachmentEntityType;
  entityId: string;
  parentEntityLabel: string;
  formData: FormData;
}): Promise<AttachmentUploadState> {
  const existingCount = await prisma.attachment.count({
    where: { organizationId, entityType, entityId },
  });
  if (existingCount >= MAX_ATTACHMENTS_PER_ENTITY) {
    return {
      error: `This ${entityType.toLowerCase()} already has the maximum of ${MAX_ATTACHMENTS_PER_ENTITY} attachments.`,
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  const validation = validateAttachmentFile({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!validation.valid) {
    return { error: VALIDATION_ERROR_MESSAGES[validation.error] };
  }

  // The sanitized name is used everywhere from here on — as the stored
  // display name, in the Storage path, and in Activity metadata — so there
  // is never a second, untrusted copy of the raw filename persisted anywhere.
  const safeFileName = sanitizeAttachmentFileName(file.name);
  const attachmentId = randomUUID();
  const storagePath = buildAttachmentStoragePath({
    organizationId,
    entityType,
    entityId,
    attachmentId,
    safeFileName,
  });

  const uploadResult = await uploadAttachmentObject({
    path: storagePath,
    body: file,
    contentType: validation.mimeType,
  });
  if (!uploadResult.ok) {
    return { error: "Failed to upload the file. Please try again." };
  }

  try {
    // Attachment row and its Activity entry are one atomic unit — a failed
    // Activity insert rolls the Attachment create back too.
    await prisma.$transaction(async (tx) => {
      await tx.attachment.create({
        data: {
          id: attachmentId,
          organizationId,
          uploadedById: actorId,
          entityType,
          entityId,
          storageBucket: ATTACHMENTS_BUCKET,
          storagePath,
          originalName: safeFileName,
          mimeType: validation.mimeType,
          sizeBytes: file.size,
        },
      });

      await createActivity(tx, {
        organizationId,
        actorId,
        entityType: "ATTACHMENT",
        entityId: attachmentId,
        action: "FILE_UPLOADED",
        metadata: buildAttachmentActivityMetadata(safeFileName, entityType, parentEntityLabel, actorName),
      });
    });
  } catch {
    // Compensate for the already-uploaded object — best-effort, since the
    // DB transaction is what failed, not this cleanup. An orphaned Storage
    // object is invisible and harmless; leaving it is strictly safer than
    // retrying the DB write here.
    await removeAttachmentObject({ path: storagePath });
    return { error: "Failed to save the uploaded file. Please try again." };
  }

  return { error: null };
}

/**
 * Entity-agnostic core of the attachment delete flow. `resolveParentLabel`
 * lets each caller resolve its own parent entity's display name (e.g. the
 * Client's or Project's name) for the FILE_DELETED Activity snapshot,
 * scoped however that caller sees fit — this module never assumes which
 * Prisma model entityId points at.
 */
export async function deleteAttachmentForEntity({
  organizationId,
  actorId,
  actorName,
  attachmentId,
  entityType,
  resolveParentLabel,
}: {
  organizationId: string;
  actorId: string;
  actorName: string;
  attachmentId: string;
  entityType: AttachmentEntityType;
  resolveParentLabel: (entityId: string) => Promise<string | null>;
}): Promise<void> {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, organizationId, entityType },
  });
  if (!attachment) {
    return;
  }

  // Snapshot taken before deletion, same reasoning as deleteClientAction —
  // Activity.entityId is not a foreign key, so this is what keeps the
  // entry readable once the Attachment row itself is gone.
  const parentLabel = (await resolveParentLabel(attachment.entityId)) ?? `Unknown ${entityType.toLowerCase()}`;

  await prisma.$transaction(async (tx) => {
    const result = await tx.attachment.deleteMany({
      where: { id: attachmentId, organizationId, entityType },
    });
    if (result.count === 0) {
      return;
    }

    await createActivity(tx, {
      organizationId,
      actorId,
      entityType: "ATTACHMENT",
      entityId: attachment.id,
      action: "FILE_DELETED",
      metadata: buildAttachmentActivityMetadata(attachment.originalName, entityType, parentLabel, actorName),
    });
  });

  // Best-effort, and deliberately after the transaction has already
  // committed — a Storage failure here must never roll back the DB delete.
  // A leftover Storage object is an invisible orphan; a DB row pointing at
  // a Storage object we failed to remove would still be gone from the UI
  // either way, so there is nothing left to keep consistent here.
  await removeAttachmentObject({ path: attachment.storagePath });
}
