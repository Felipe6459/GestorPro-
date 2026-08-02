"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { createActivity } from "@/lib/activity/create-activity";
import { buildInvoiceMetadata } from "@/lib/activity/invoice-metadata";
import { deleteAttachmentsForParent, cleanupAttachmentStorageObjects } from "@/lib/attachments/attachment-mutations";

export async function deleteInvoiceAction(invoiceId: string) {
  const { user, organizationId } = await getCurrentUserOrganization();

  // Delete, its Activity row, and Attachment cleanup are one atomic unit —
  // a failed Activity/Attachment insert rolls everything back together.
  const storagePaths = await prisma.$transaction(async (tx) => {
    // Snapshot taken before deletion — Activity.entityId is not a foreign
    // key, so this row (and its metadata) is what keeps the entry readable
    // once the Invoice row itself is gone.
    const existing = await tx.invoice.findFirst({
      where: { id: invoiceId, project: { organizationId } },
      include: { project: { select: { name: true } } },
    });

    if (!existing) {
      return null;
    }

    const result = await tx.invoice.deleteMany({
      where: { id: invoiceId, project: { organizationId } },
    });

    if (result.count === 0) {
      return null;
    }

    await createActivity(tx, {
      organizationId,
      actorId: user.id,
      entityType: "INVOICE",
      entityId: invoiceId,
      action: "DELETED",
      metadata: buildInvoiceMetadata(existing, existing.project.name, user.name),
    });

    const { storagePaths } = await deleteAttachmentsForParent(tx, {
      organizationId,
      actorId: user.id,
      actorName: user.name,
      targets: [{ entityType: "INVOICE", entityId: invoiceId, parentEntityLabel: existing.invoiceNumber }],
    });

    return storagePaths;
  });

  if (storagePaths) {
    await cleanupAttachmentStorageObjects(storagePaths);
  }

  revalidatePath("/invoices");
}
