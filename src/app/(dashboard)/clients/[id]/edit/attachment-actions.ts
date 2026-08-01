"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { createActivity } from "@/lib/activity/create-activity";
import { buildAttachmentActivityMetadata } from "@/lib/activity/attachment-metadata";
import {
  sanitizeAttachmentFileName,
  validateAttachmentFile,
  buildAttachmentStoragePath,
} from "@/lib/storage/attachment-files";
import { uploadAttachmentObject, removeAttachmentObject } from "@/lib/storage/attachments-storage";
import { ATTACHMENTS_BUCKET, MAX_ATTACHMENTS_PER_ENTITY } from "@/lib/storage/attachments-config";
import type { AttachmentUploadState } from "@/types";

const VALIDATION_ERROR_MESSAGES: Record<string, string> = {
  empty_file: "The selected file is empty.",
  file_too_large: "This file is too large. Maximum size is 10 MB.",
  type_not_allowed: "This file type is not supported.",
  extension_mismatch: "The file extension doesn't match its detected type.",
};

export async function uploadAttachmentAction(
  clientId: string,
  _prevState: AttachmentUploadState,
  formData: FormData,
): Promise<AttachmentUploadState> {
  const { user, organizationId } = await getCurrentUserOrganization();

  // Scoped by id + organizationId — a foreign org's client id simply
  // doesn't match, indistinguishable from a nonexistent one.
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true, name: true },
  });
  if (!client) {
    return { error: "This client could not be found." };
  }

  const existingCount = await prisma.attachment.count({
    where: { organizationId, entityType: "CLIENT", entityId: clientId },
  });
  if (existingCount >= MAX_ATTACHMENTS_PER_ENTITY) {
    return {
      error: `This client already has the maximum of ${MAX_ATTACHMENTS_PER_ENTITY} attachments.`,
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
    entityType: "CLIENT",
    entityId: clientId,
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
          uploadedById: user.id,
          entityType: "CLIENT",
          entityId: clientId,
          storageBucket: ATTACHMENTS_BUCKET,
          storagePath,
          originalName: safeFileName,
          mimeType: validation.mimeType,
          sizeBytes: file.size,
        },
      });

      await createActivity(tx, {
        organizationId,
        actorId: user.id,
        entityType: "ATTACHMENT",
        entityId: attachmentId,
        action: "FILE_UPLOADED",
        metadata: buildAttachmentActivityMetadata(safeFileName, "CLIENT", client.name, user.name),
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

  revalidatePath(`/clients/${clientId}/edit`);
  return { error: null };
}

export async function deleteAttachmentAction(clientId: string, attachmentId: string): Promise<void> {
  const { user, organizationId } = await getCurrentUserOrganization();

  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, organizationId, entityType: "CLIENT" },
  });
  if (!attachment) {
    return;
  }

  // Snapshot taken before deletion, same reasoning as deleteClientAction —
  // Activity.entityId is not a foreign key, so this is what keeps the
  // entry readable once the Attachment row itself is gone.
  const parentClient = await prisma.client.findFirst({
    where: { id: attachment.entityId, organizationId },
    select: { name: true },
  });

  await prisma.$transaction(async (tx) => {
    const result = await tx.attachment.deleteMany({
      where: { id: attachmentId, organizationId, entityType: "CLIENT" },
    });
    if (result.count === 0) {
      return;
    }

    await createActivity(tx, {
      organizationId,
      actorId: user.id,
      entityType: "ATTACHMENT",
      entityId: attachment.id,
      action: "FILE_DELETED",
      metadata: buildAttachmentActivityMetadata(
        attachment.originalName,
        "CLIENT",
        parentClient?.name ?? "Unknown client",
        user.name,
      ),
    });
  });

  // Best-effort, and deliberately after the transaction has already
  // committed — a Storage failure here must never roll back the DB delete.
  // A leftover Storage object is an invisible orphan; a DB row pointing at
  // a Storage object we failed to remove would still be gone from the UI
  // either way, so there is nothing left to keep consistent here.
  await removeAttachmentObject({ path: attachment.storagePath });

  revalidatePath(`/clients/${clientId}/edit`);
}
